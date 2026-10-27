import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { CANARY_TAG, PREVIOUS_TAG, createCloudRun } from "./cloudrun.ts";
import type { Target } from "./cloudrun.ts";
import { opsContext } from "./context.ts";
import { ENV } from "./env.ts";
import type { Range } from "./google.ts";
import {
  RELEASE_GUARD_LABEL,
  canaryVerdict,
  releaseGuardBody,
} from "./release.ts";
import type { Health, Probe } from "./release.ts";
import { fromRoot } from "./root.ts";

// Progressive delivery's CI half (docs/adr/0001-progressive-delivery.md):
//   verify    after deploy:production put the new revision on the `canary`
//             tag with a small share, probe it and count each revision's
//             5xx responses for CANARY_WINDOW_S, then promote it (100%) or
//             roll back to the stable revision and file a release-guard
//             issue for the wovain release-guard Duo flow.
//   rollback  a ROLLBACK=1 pipeline the ops job's release guard starts:
//             100% back to ROLLBACK_TO, or the newest ready revision older
//             than the one serving now.
// Runs as gitlab-deploy (production environment), the account that deploys.
// Every step lands in canary.md (a job artifact) and in the job log.

const mode = process.argv[2] === "rollback" ? "rollback" : "verify";
const PROBE_PATHS = ["/", "/api/auth/ok", "/api/checkout/quote"];
// A new wovain-web instance answers its first request on each path in about
// 17 s while it loads routes, and Cloud Run starts instances during the
// window as it scales, so a probe allows 30 s: a slow cold start isn't a
// failed release. The probes start after one warm-up request per path.
const PROBE_TIMEOUT_MS = 30_000;
const WARMUP_TIMEOUT_MS = 60_000;

const { env, gitlab, google } = opsContext();
const service = ENV.CLOUD_RUN_SERVICE ?? "wovain-web";
const run = createCloudRun({
  project: env.GCP_PROJECT_ID,
  region: ENV.GCP_REGION ?? "us-central1",
  service,
});
const source = ENV.CI_JOB_URL ?? "a local run";
const audit: string[] = [`# ${mode === "verify" ? "Canary" : "Rollback"}`, ""];
const log = (line: string) => {
  console.log(line);
  audit.push(`- ${line}`);
};

const status = async (url: string, timeoutMs = PROBE_TIMEOUT_MS) => {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status;
  } catch {
    return 0;
  }
};

const requestsFilter = (revision: string) =>
  `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND resource.labels.revision_name="${revision}" AND log_id("run.googleapis.com/requests")`;

const healthOf = async (revision: string, range: Range): Promise<Health> => {
  const filter = requestsFilter(revision);
  const [all, errors] = await Promise.all([
    google.entries(filter, range),
    google.entries(`${filter} AND httpRequest.status>=500`, range),
  ]);
  return { errors: errors.entries.length, requests: all.entries.length };
};

// A release-guard issue, assigned to the flow's service account, which is
// what starts the flow (a person's token, as for the heal flow).
const fileIssue = async (title: string, body: string) => {
  const issue = await gitlab.createIssue({
    description: body,
    labels: RELEASE_GUARD_LABEL,
    title,
  });
  log(`filed ${issue.web_url}`);
  const account = ENV.DUO_RELEASE_GUARD_ACCOUNT;
  if (account === undefined || account === "") {
    return;
  }
  try {
    const id = await gitlab.userId(account);
    await gitlab.updateIssue(issue.iid, { assigneeIds: [id] });
    log(`assigned to ${account}: the wovain release-guard flow starts`);
  } catch (error) {
    log(
      `could not assign ${account} (${error instanceof Error ? error.message : "unknown"}); the ops job retries`
    );
  }
};

const verify = async () => {
  const { canary, previous, stable } = await run.split();
  if (canary === undefined || canary.uri === undefined) {
    log("no revision on the canary tag: nothing to verify");
    return true;
  }
  if (stable === undefined || canary.percent >= 100) {
    log(`${canary.revision} already serves all traffic`);
    return true;
  }
  log(
    `canary ${canary.revision} at ${canary.percent}% (${canary.uri}), stable ${stable.revision} at ${stable.percent}%`
  );
  const warmup = await Promise.all(
    PROBE_PATHS.map(
      async (path) =>
        `${path} ${await status(new URL(path, canary.uri).href, WARMUP_TIMEOUT_MS)}`
    )
  );
  log(`warm-up: ${warmup.join(", ")}`);
  const windowMs = (ENV.CANARY_WINDOW_S ?? 300) * 1000;
  const intervalMs = (ENV.CANARY_INTERVAL_S ?? 30) * 1000;
  const start = new Date();
  const probes: Probe[] = [];
  const site = ENV.SITE_URL;
  while (Date.now() - start.getTime() < windowMs) {
    // A path counts against the canary only when the live site answers it,
    // so a fault both revisions share (a flag) isn't blamed on the deploy.
    // oxlint-disable-next-line eslint/no-await-in-loop -- one probe round per interval, in order
    const round = await Promise.all(
      PROBE_PATHS.map(async (path) => {
        const [onCanary, onSite] = await Promise.all([
          status(new URL(path, canary.uri).href),
          status(new URL(path, site).href),
        ]);
        return { onSite, path, status: onCanary };
      })
    );
    for (const p of round) {
      if (p.onSite > 0 && p.onSite < 500) {
        probes.push({ path: p.path, status: p.status });
      }
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- the wait between rounds
    await sleep(intervalMs);
  }
  const range = { end: new Date(), start };
  const [canaryHealth, stableHealth] = await Promise.all([
    healthOf(canary.revision, range),
    healthOf(stable.revision, range),
  ]);
  log(
    `probes: ${probes.filter((p) => p.status > 0 && p.status < 500).length}/${probes.length} ok`
  );
  log(
    `5xx: canary ${canaryHealth.errors}/${canaryHealth.requests}, stable ${stableHealth.errors}/${stableHealth.requests}`
  );
  const result = canaryVerdict({
    canary: canaryHealth,
    probes,
    stable: stableHealth,
  });
  if (result.verdict === "promote") {
    // The old stable revision keeps the `previous` tag at 0%: a later
    // rollback returns there, never to a canary that was rejected.
    await run.sendAllTo(canary.revision, [
      { ...stable, percent: 0, tag: PREVIOUS_TAG },
    ]);
    log(`promoted ${canary.revision} to 100%; ${stable.revision} is previous`);
    return true;
  }
  const kept: Target[] = [
    { ...canary, tag: CANARY_TAG },
    ...(previous === undefined ? [] : [previous]),
  ];
  await run.sendAllTo(stable.revision, kept);
  log(
    `rolled back to ${stable.revision}; ${canary.revision} keeps 0% on its tag for debugging`
  );
  await fileIssue(
    `Canary rolled back: ${canary.revision}`,
    releaseGuardBody({
      action: `canary ${canary.revision} rolled back to ${stable.revision}`,
      evidence: [
        `Commit ${ENV.CI_COMMIT_SHA ?? "unknown"}, pipeline ${ENV.CI_PIPELINE_URL ?? "unknown"}`,
        `Canary tag URL: ${canary.uri}`,
        `5xx in the window: canary ${canaryHealth.errors}/${canaryHealth.requests}, stable ${stableHealth.errors}/${stableHealth.requests}`,
        `Failed probes: ${
          probes
            .filter((p) => p.status === 0 || p.status >= 500)
            .map((p) => `${p.path} (${p.status})`)
            .join(", ") || "none"
        }`,
      ],
      reasons: result.reasons,
      source,
    })
  );
  return false;
};

const rollback = async () => {
  const { canary, previous, stable } = await run.split();
  const [serving] = [stable, canary]
    .filter((t) => t !== undefined)
    .toSorted((a, b) => b.percent - a.percent);
  const revisions = await run.revisions();
  const current = revisions.find((r) => r.name === serving?.revision);
  const named =
    ENV.ROLLBACK_TO === undefined || ENV.ROLLBACK_TO === ""
      ? undefined
      : ENV.ROLLBACK_TO;
  // Named, else the last revision that served all of production, else the
  // newest ready one before the current.
  const target =
    named ??
    previous?.revision ??
    revisions.find(
      (r) =>
        r.ready &&
        r.name !== serving?.revision &&
        (current === undefined || r.createdAt < current.createdAt)
    )?.name;
  if (target === undefined) {
    log("no earlier ready revision to roll back to");
    return false;
  }
  await run.sendAllTo(target);
  log(`moved 100% from ${serving?.revision ?? "unknown"} to ${target}`);
  const [issue] = await gitlab.issues({
    labels: RELEASE_GUARD_LABEL,
    state: "opened",
  });
  if (issue !== undefined) {
    await gitlab.noteOnIssue(
      issue.iid,
      `Rolled back: 100% of production moved from \`${serving?.revision ?? "unknown"}\` to \`${target}\` by ${source}.`
    );
  }
  return true;
};

// Whatever fails after the canary got its share sends production back to
// the stable revision, so an unverified revision never keeps traffic.
const failSafe = async (error: unknown) => {
  log(`failed: ${error instanceof Error ? error.message : "unknown"}`);
  if (mode !== "verify") {
    return false;
  }
  try {
    const { canary, stable } = await run.split();
    if (canary !== undefined && stable !== undefined && canary.percent > 0) {
      await run.sendAllTo(stable.revision, [{ ...canary, tag: CANARY_TAG }]);
      log(`rolled back to ${stable.revision} because the verdict failed`);
    }
  } catch (rollbackError) {
    log(
      `the fail-safe rollback failed too: ${rollbackError instanceof Error ? rollbackError.message : "unknown"}`
    );
  }
  return false;
};

let ok = false;
try {
  ok = mode === "verify" ? await verify() : await rollback();
} catch (error) {
  ok = await failSafe(error);
}
await writeFile(fromRoot("canary.md"), `${audit.join("\n")}\n`);
if (!ok) {
  process.exitCode = 1;
}
