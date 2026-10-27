import { FLAGS, isFlagName } from "../../../packages/core/src/flag-registry.ts";
import type { FlagDefinition } from "../../../packages/core/src/flag-registry.ts";
import { machineData } from "./heal.ts";
import type { ExceptionCounts } from "./posthog.ts";

// Progressive delivery (docs/adr/0001-progressive-delivery.md), the parts
// that decide: the canary verdict after a deploy, the release guard's action
// when production degrades later, and the flag hygiene findings. Pure
// functions; canary.ts and ops.ts do the I/O and leave the audit trail.

export const RELEASE_GUARD_LABEL = "release-guard";
export const FLAG_CLEANUP_LABEL = "flag-cleanup";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Canary: two probes answered with a 5xx, more than 10% of probes with no
// answer at all (status 0: a cold start or a dropped connection, not the
// code), or a 5xx rate of at least 2% (and at least twice the stable
// revision's) over at least 3 errors, rolls back.
const MAX_FAILED_PROBES = 2;
const MAX_UNANSWERED_SHARE = 0.1;
const MIN_ERRORS = 3;
const MAX_ERROR_RATE = 0.02;
// Release guard: production is degraded at 10+ server-side exceptions (the
// app's errors and the platform's 5xx, crashes and OOMs) in PostHog Error
// Tracking in the window, or 20+ browser exceptions.
const GUARD_MAX_SERVER_EXCEPTIONS = 10;
const GUARD_MAX_EXCEPTIONS = 20;
// What a degradation is blamed on: a change in the last 2 hours.
const GUARD_WINDOW_MS = 2 * HOUR_MS;
// A deploy that finished this recently is still the canary job's to judge:
// its install, CANARY_WINDOW_S (10 minutes), the probes and the final log
// queries, with a margin. The guard leaves its traffic alone until then.
const CANARY_GRACE_MS = 20 * MINUTE_MS;
// One automatic action an hour, three a day.
const COOLDOWN_MS = HOUR_MS;
const MAX_ACTIONS_PER_DAY = 3;
// Hygiene: a release flag serving all of production this long is done.
const FULLY_ROLLED_OUT_MS = 14 * DAY_MS;

export interface Health {
  requests: number;
  errors: number;
}

const errorRate = ({ errors, requests }: Health) =>
  requests === 0 ? 0 : errors / requests;

export interface Probe {
  path: string;
  // 0 when the request itself failed.
  status: number;
}

export interface CanaryVerdict {
  verdict: "promote" | "rollback";
  reasons: string[];
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export const canaryVerdict = ({
  canary,
  probes,
  stable,
}: {
  canary: Health;
  probes: Probe[];
  stable: Health;
}): CanaryVerdict => {
  const reasons: string[] = [];
  const failed = probes.filter((p) => p.status === 0 || p.status >= 500);
  const errored = failed.filter((p) => p.status >= 500);
  const unanswered = failed.length - errored.length;
  if (
    errored.length >= MAX_FAILED_PROBES ||
    unanswered > probes.length * MAX_UNANSWERED_SHARE
  ) {
    const paths = [...new Set(failed.map((p) => `${p.path} (${p.status})`))];
    reasons.push(
      `${failed.length} of ${probes.length} probes failed: ${paths.join(", ")}`
    );
  }
  const canaryRate = errorRate(canary);
  const limit = Math.max(MAX_ERROR_RATE, 2 * errorRate(stable));
  if (canary.errors >= MIN_ERRORS && canaryRate > limit) {
    reasons.push(
      `canary 5xx rate ${percent(canaryRate)} (${canary.errors}/${canary.requests}) over ${percent(limit)}; stable ${percent(errorRate(stable))}`
    );
  }
  return { reasons, verdict: reasons.length > 0 ? "rollback" : "promote" };
};

// A GitLab feature flag as the REST API returns it.
export interface GitLabFlag {
  name: string;
  active: boolean;
  updated_at: string;
  strategies: {
    name: string;
    parameters?: Record<string, string> | null | undefined;
    scopes: { environment_scope: string }[];
  }[];
}

export type GuardAction =
  | { action: "none"; reasons: string[] }
  | { action: "flag-off"; flag: string; reasons: string[] }
  | { action: "rollback"; reasons: string[] };

// Why production itself is degraded, if it is.
const productionReasons = (exceptions: ExceptionCounts) => {
  const reasons: string[] = [];
  if (exceptions.production >= GUARD_MAX_SERVER_EXCEPTIONS) {
    reasons.push(
      `production: ${exceptions.production} server exceptions in PostHog error tracking`
    );
  }
  if (exceptions.browser >= GUARD_MAX_EXCEPTIONS) {
    reasons.push(
      `${exceptions.browser} browser exceptions in PostHog error tracking`
    );
  }
  return reasons;
};

export const guardDecision = ({
  actions,
  deployedAt,
  exceptions,
  firingKpis,
  flags,
  now,
}: {
  // When the guard acted in the last day, newest first.
  actions: Date[];
  // The latest successful production deployment.
  deployedAt: Date | undefined;
  // PostHog Error Tracking's exceptions in the window, the one error sink:
  // production's server side, dev.wovain.com's (they can blame a flag, whose
  // Status is global, never move production traffic) and the browser's.
  // Failed synthetic checks file heal issues instead.
  exceptions: ExceptionCounts;
  // KPI ids whose PostHog `kpi:` alert fires now.
  firingKpis: string[];
  flags: GitLabFlag[];
  now: Date;
}): GuardAction => {
  const reasons = productionReasons(exceptions);
  const serverSide = reasons.length > 0;
  if (exceptions.dev >= GUARD_MAX_SERVER_EXCEPTIONS) {
    reasons.push(
      `development: ${exceptions.dev} server exceptions in PostHog error tracking`
    );
  }
  if (firingKpis.length > 0) {
    reasons.push(`PostHog KPI alerts firing: ${firingKpis.join(", ")}`);
  }
  if (reasons.length === 0) {
    return { action: "none", reasons: ["production is healthy"] };
  }
  const [last] = actions;
  if (last !== undefined && now.getTime() - last.getTime() < COOLDOWN_MS) {
    return { action: "none", reasons: [...reasons, "cooling down"] };
  }
  if (actions.length >= MAX_ACTIONS_PER_DAY) {
    return { action: "none", reasons: [...reasons, "daily cap reached"] };
  }
  const recent = (at: number) => now.getTime() - at < GUARD_WINDOW_MS;
  // The newest guarded flag that is on and changed in the window.
  const [flag] = flags
    .filter((f) => {
      if (!(f.active && isFlagName(f.name))) {
        return false;
      }
      const definition: FlagDefinition = FLAGS[f.name];
      return definition.guarded && recent(Date.parse(f.updated_at));
    })
    .toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  // A KPI alert alone never blames a flag either: it can have fired for
  // days before the flag changed.
  const measured =
    serverSide || reasons.some((r) => r.startsWith("development"));
  const deployed =
    deployedAt !== undefined && recent(deployedAt.getTime())
      ? deployedAt
      : undefined;
  // Production's degradation is blamed on the newer change: a deploy after
  // the flag's last edit is the likelier cause. dev.wovain.com's isn't
  // production's deploy, so a dev spike still blames the flag.
  const deployIsNewer =
    serverSide &&
    deployed !== undefined &&
    flag !== undefined &&
    deployed.getTime() > Date.parse(flag.updated_at);
  if (flag !== undefined && measured && !deployIsNewer) {
    return {
      action: "flag-off",
      flag: flag.name,
      reasons: [...reasons, `${flag.name} changed at ${flag.updated_at}`],
    };
  }
  // A KPI alert alone never moves traffic: KPIs are measured over days.
  if (serverSide && deployed !== undefined) {
    if (now.getTime() - deployed.getTime() < CANARY_GRACE_MS) {
      return {
        action: "none",
        reasons: [
          ...reasons,
          `deployed at ${deployed.toISOString()}: the canary job is still verifying it`,
        ],
      };
    }
    return {
      action: "rollback",
      reasons: [...reasons, `deployed at ${deployed.toISOString()}`],
    };
  }
  return {
    action: "none",
    reasons: [...reasons, "no flag change or deploy in the last 2 hours"],
  };
};

export interface HygieneFinding {
  flag: string;
  problem: "expired" | "fully-rolled-out" | "not-in-registry" | "not-in-gitlab";
  detail: string;
}

const servesAllOfProduction = (flag: GitLabFlag) =>
  flag.strategies.some(
    (s) =>
      (s.name === "default" ||
        (s.name === "gradualRolloutUserId" &&
          s.parameters?.["percentage"] === "100")) &&
      s.scopes.some(
        (scope) =>
          scope.environment_scope === "production" ||
          scope.environment_scope === "*"
      )
  );

export const hygieneFindings = (
  flags: GitLabFlag[],
  now: Date
): HygieneFinding[] => {
  const inGitLab = new Set(flags.map((f) => f.name));
  const missing: HygieneFinding[] = Object.keys(FLAGS)
    .filter((name) => !inGitLab.has(name))
    .map((flag) => ({
      detail: "In the registry but not in GitLab: run `pulumi up`.",
      flag,
      problem: "not-in-gitlab",
    }));
  const found = flags.flatMap((f): HygieneFinding[] => {
    if (!isFlagName(f.name)) {
      return [
        {
          detail:
            "In GitLab but not in packages/core/src/flag-registry.ts: add it or delete it.",
          flag: f.name,
          problem: "not-in-registry",
        },
      ];
    }
    const definition: FlagDefinition = FLAGS[f.name];
    if (Date.parse(definition.expires) < now.getTime()) {
      return [
        {
          detail: `Expired on ${definition.expires}.`,
          flag: f.name,
          problem: "expired",
        },
      ];
    }
    const unchangedFor = now.getTime() - Date.parse(f.updated_at);
    if (
      definition.type === "release" &&
      f.active &&
      servesAllOfProduction(f) &&
      unchangedFor >= FULLY_ROLLED_OUT_MS
    ) {
      return [
        {
          detail: `Serves all of production, unchanged for ${Math.floor(unchangedFor / DAY_MS)} days.`,
          flag: f.name,
          problem: "fully-rolled-out",
        },
      ];
    }
    return [];
  });
  return [...missing, ...found];
};

export const cleanupMarker = (finding: HygieneFinding) =>
  `<!-- wovain:flag-cleanup:${finding.flag}:${finding.problem} -->`;

export const cleanupBody = (finding: HygieneFinding) => {
  const definition: FlagDefinition | undefined = isFlagName(finding.flag)
    ? FLAGS[finding.flag]
    : undefined;
  return [
    `The flag hygiene check found a problem with the GitLab feature flag \`${finding.flag}\`: ${finding.detail}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Problem | ${finding.problem} |`,
    `| Owner | ${definition === undefined ? "unknown" : `${definition.owner.team} (@${definition.owner.gitlab})`} |`,
    `| Expires | ${definition?.expires ?? "unknown"} |`,
    `| Type | ${definition?.type ?? "unknown"} |`,
    "",
    "To clean up a release flag: keep the code path it turned on, delete the other one and every `isOn` call for it, remove it from `packages/core/src/flag-registry.ts`, and let `pulumi up` delete it in GitLab. To keep it, move its expiry in the registry with a reason.",
    "",
    cleanupMarker(finding),
  ].join("\n");
};

// A visible line in the issue's "Machine data" block: the flow's get_issue
// tool strips HTML comments. Older issues carry `<!-- wovain:release-guard -->`,
// which contains it too.
const RELEASE_GUARD_MARKER = "wovain:release-guard";
export const hasReleaseGuardMarker = (description: string | null) =>
  (description ?? "").includes(RELEASE_GUARD_MARKER);

// The issue the release guard files after it acted; the wovain release-guard
// Duo flow reads it and writes the diagnosis.
export const releaseGuardBody = ({
  action,
  evidence,
  reasons,
  source,
}: {
  action: string;
  evidence: string[];
  reasons: string[];
  // The job or pipeline that acted.
  source: string;
}) =>
  [
    `The release guard acted on production: **${action}**.`,
    "",
    "## Why",
    "",
    ...reasons.map((r) => `- ${r}`),
    "",
    "## Evidence",
    "",
    ...evidence.map((e) => `- ${e}`),
    "",
    `Acted from ${source}. Nothing is switched back on automatically: after the diagnosis, a person re-enables the flag or merges the fix, and the next deploy goes through the canary again.`,
    "",
    machineData(RELEASE_GUARD_MARKER),
  ].join("\n");
