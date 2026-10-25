import { mkdir, writeFile } from "node:fs/promises";

import { z } from "zod";

import { opsContext } from "./env.ts";
import type { Issue, MergeRequest, Note } from "./gitlab.ts";
import {
  blockers,
  diffLines,
  openThreads,
  outsidersOf,
  reviewDone,
  reviewedShaOf,
  scopeBlockers,
} from "./guardrails.ts";
import {
  DEPLOY_GRACE_MS,
  HEAL_LABEL,
  MAX_HEAL_IN_FLIGHT,
  MAX_HEAL_PER_DAY,
  VERIFIED_LABEL,
  groupErrors,
  healBody,
  healTitle,
  incidentBody,
  newProblems,
  parseSignature,
  verdict,
} from "./heal.ts";
import { TASK_LABEL, taskBlocker, taskBudget } from "./intake.ts";
import { loadKpis } from "./kpis.ts";
import { doraOf, healthOf, renderStatus } from "./status.ts";
import {
  VULN_LABEL,
  pickVulns,
  startedMarker,
  startedVulns,
  vulnMergeRequests,
} from "./vulns.ts";

// The ops job (.gitlab/ci/ops.yml), every 10 minutes on the "wovain ops"
// pipeline schedule. It moves the self-healing and issue-to-completion flows
// along with GITLAB_TOKEN, a person's token, because GitLab starts a flow
// only for a human's action:
//   heal     production errors → heal issue → assigned to the heal flow
//   verify   merged heal fixes → production clean? → verified, or reopened
//            and an incident for each, closed when production confirms
//   intake   agent::task issues → checks and caps → assigned to Developer
//   vulns    new High/Critical SAST findings → Duo Vulnerability Resolution
//   shepherd Duo's MRs → ready → Duo Code Review → guardrails → auto-merge
//   status   public/index.html for the status page (the pages job publishes it)
// It never merges anything itself; GitLab merges once the pipeline passes.

const WATCH_MS = 30 * 60_000;
const sciSchema = z.object({ perThousand: z.number().nullable().optional() });
const SETTLE_MS = 10 * 60_000;
const REVIEW_TIMEOUT_MS = 2 * 3_600_000;
const DAY_MS = 86_400_000;

const { env, gitlab, google } = opsContext();
const config = await loadKpis();
const now = new Date();
const me = await gitlab.currentUser();
const trusted = new Set([me.username, ...env.TRUSTED_USERS]);
const developer = env.DUO_DEVELOPER_ACCOUNT;
const healer = env.DUO_HEAL_ACCOUNT;
const reviewer = env.DUO_REVIEW_ACCOUNT;
const errorFilter = `${config.service.logs} AND jsonPayload.level="error" AND jsonPayload.error.name:*`;

const marker = (kind: string) => `<!-- wovain:${kind} -->`;
const hasMarker = (notes: Note[], kind: string) =>
  notes.some((n) => n.body.includes(marker(kind)));
const logsUrl = (filter: string) =>
  `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(filter)}?project=${env.GCP_PROJECT_ID}`;

const working = (i: Issue) => i.assignees.some((a) => a.username === developer);

// Incident extras (severity, timeline) are best effort: the incident itself
// and its link to the heal issue are what the flow relies on.
const bestEffort = async (what: string, act: () => Promise<unknown>) => {
  try {
    await act();
    return [];
  } catch (error) {
    return [
      `${what} failed: ${error instanceof Error ? error.message : "unknown"}`,
    ];
  }
};

const incidentsOf = async (issue: number) => {
  const links = await gitlab.issueLinks(issue);
  return links.filter((i) => i.issue_type === "incident");
};

// Adds a note and a timeline event to each open incident linked to an issue.
const tellIncidents = async (
  issue: number,
  note: string,
  close: boolean
): Promise<string[]> => {
  const incidents = await incidentsOf(issue);
  const open = incidents.filter((i) => i.state === "opened");
  const problems = await Promise.all(
    open.map(async (incident) => {
      await gitlab.noteOnIssue(incident.iid, note);
      if (close) {
        await gitlab.updateIssue(incident.iid, { state_event: "close" });
      }
      return await bestEffort("timeline event", () =>
        gitlab.timelineEvent(incident.id, note, now)
      );
    })
  );
  return problems.flat();
};

const assignTo = async (issue: number, username: string) => {
  const id = await gitlab.userId(username);
  await gitlab.updateIssue(issue, { assignee_ids: [id] });
};

// Flow 1: file the most frequent new production error and hand it to the
// heal flow, within the daily and in-flight caps.
const heal = async () => {
  const range = { end: now, start: new Date(now.getTime() - WATCH_MS) };
  const { entries } = await google.entries(errorFilter, range);
  const groups = groupErrors(entries);
  const issues = await gitlab.issues({
    labels: HEAL_LABEL,
    state: "all",
    updated_after: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
  });
  const known = issues.flatMap((i) => {
    const s = parseSignature(i.description);
    return s === undefined
      ? []
      : [
          {
            closedAt: i.closed_at ?? undefined,
            fingerprint: s.fingerprint,
            open: i.state === "opened",
          },
        ];
  });
  const [problem] = newProblems(groups, known, now);
  if (problem === undefined) {
    return `${groups.length} error signature(s) in 30 min, none new`;
  }
  const inFlight = issues.filter(
    (i) => i.state === "opened" && !i.labels.includes(VERIFIED_LABEL)
  ).length;
  const today = issues.filter(
    (i) =>
      i.author.username === me.username &&
      now.getTime() - Date.parse(i.created_at) < DAY_MS
  ).length;
  if (inFlight >= MAX_HEAL_IN_FLIGHT || today >= MAX_HEAL_PER_DAY) {
    return `new signature ${problem.signature.fingerprint} waits: ${inFlight} in flight, ${today} today`;
  }
  const s = problem.signature;
  const created = await gitlab.createIssue({
    confidential: true,
    description: healBody(
      problem,
      "30 min",
      logsUrl(`${errorFilter} AND jsonPayload.path="${s.path}"`)
    ),
    labels: `${HEAL_LABEL},type::bug`,
    title: healTitle(s),
  });
  await assignTo(created.iid, healer);
  // The incident people follow; the heal issue is what Duo works on.
  const incident = await gitlab.createIssue({
    confidential: true,
    description: incidentBody(problem, created.iid),
    issue_type: "incident",
    title: `Incident: ${healTitle(s)}`,
  });
  await gitlab.linkIssues(created.iid, incident.iid);
  const problems = [
    ...(await bestEffort("severity", () =>
      gitlab.setSeverity(incident.iid, "HIGH")
    )),
    ...(await bestEffort("timeline event", () =>
      gitlab.timelineEvent(
        incident.id,
        `Detected: ${problem.count} ${s.name} errors on ${s.method} ${s.path}; #${created.iid} assigned to the heal flow.`,
        new Date(problem.firstSeen || now.toISOString())
      )
    )),
  ];
  return `filed #${created.iid} and incident #${incident.iid} for ${s.fingerprint}, assigned the heal flow${problems.length > 0 ? ` (${problems.join("; ")})` : ""}`;
};

// Flow 1, after the merge: production must stay clean of the signature.
const verifyOne = async (issue: Issue) => {
  const signature = parseSignature(issue.description);
  const related = await gitlab.relatedMergeRequests(issue.iid);
  const [mergedAt] = related
    .flatMap((m) => (m.merged_at ? [Date.parse(m.merged_at)] : []))
    .toSorted((a, b) => b - a);
  if (signature === undefined || mergedAt === undefined) {
    return "skip: no signature or no merged MR";
  }
  const start = new Date(mergedAt + DEPLOY_GRACE_MS);
  const { entries } =
    start < now
      ? await google.entries(
          `${errorFilter} AND jsonPayload.path="${signature.path}"`,
          { end: now, start }
        )
      : { entries: [] };
  const events =
    groupErrors(entries).find(
      (g) => g.signature.fingerprint === signature.fingerprint
    )?.count ?? 0;
  const result = verdict({
    eventsSinceDeploy: events,
    mergedAt: new Date(mergedAt),
    now,
  });
  if (result.kind === "verified") {
    await gitlab.noteOnIssue(
      issue.iid,
      `Verified in production: no \`${signature.fingerprint}\` errors in the ${result.minutes} minutes since the fix deployed. You can turn the \`fault-injection-checkout\` flag off.\n\n${marker("verified")}`
    );
    await gitlab.updateIssue(issue.iid, { add_labels: VERIFIED_LABEL });
    await tellIncidents(
      issue.iid,
      `Resolved: the fix for #${issue.iid} is verified in production, no \`${signature.fingerprint}\` errors in ${result.minutes} minutes.`,
      true
    );
  } else if (result.kind === "regressed") {
    await gitlab.updateIssue(issue.iid, { state_event: "reopen" });
    await gitlab.noteOnIssue(
      issue.iid,
      `Reopened: production logged ${result.events} \`${signature.fingerprint}\` error(s) after the fix deployed. @${me.username} please look; the ops job won't hand it to Duo again.\n\n${marker("regressed")}`
    );
    await tellIncidents(
      issue.iid,
      `The fix for #${issue.iid} didn't hold: ${result.events} error(s) since it deployed. A person takes over.`,
      false
    );
  }
  return result.kind;
};

const verifyHeals = async () => {
  const closed = await gitlab.issues({
    labels: HEAL_LABEL,
    state: "closed",
    updated_after: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
  });
  const pending = closed.filter((i) => !i.labels.includes(VERIFIED_LABEL));
  const results = await Promise.all(
    pending.map(async (i) => [i.iid, await verifyOne(i)] as const)
  );
  return Object.fromEntries(results);
};

// Flow 3: hand trusted agent::task issues to the Developer flow.
const intake = async () => {
  const [open, sessions] = await Promise.all([
    gitlab.issues({ labels: TASK_LABEL, sort: "asc", state: "opened" }),
    gitlab.sessions(),
  ]);
  let budget = taskBudget({
    inFlight: open.filter(working).length,
    now,
    sessions,
  });
  const outcomes: Record<number, string> = {};
  for (const issue of open.filter((i) => !working(i))) {
    if (budget === 0) {
      outcomes[issue.iid] = "waits: task cap reached";
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- one at a time, so the cap holds
    const [events, notes] = await Promise.all([
      gitlab.labelEvents(issue.iid),
      gitlab.issueNotes(issue.iid),
    ]);
    const reason = taskBlocker({
      duoAccounts: [developer, reviewer],
      events,
      issue,
      notes,
      trusted,
    });
    if (reason === undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
      await assignTo(issue.iid, developer);
      budget -= 1;
      outcomes[issue.iid] = "assigned to the Developer flow";
    } else {
      const kind = `blocked:${reason.replaceAll(/[^a-z]+/giu, "-")}`;
      if (!hasMarker(notes, kind)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
        await gitlab.noteOnIssue(
          issue.iid,
          `Not handed to Duo: ${reason}.\n\n${marker(kind)}`
        );
      }
      outcomes[issue.iid] = `blocked: ${reason}`;
    }
  }
  return outcomes;
};

// The confidential issue whose notes record every Vulnerability Resolution
// the ops job started (audit trail and daily cap).
const vulnLog = async () => {
  const [found] = await gitlab.issues({ labels: VULN_LABEL, state: "opened" });
  if (found !== undefined) {
    return found;
  }
  return await gitlab.createIssue({
    confidential: true,
    description:
      "wovain ops records here each new High or Critical SAST finding it hands to Duo Vulnerability Resolution (docs/flows.md). The merge requests go through Duo Code Review and auto-merge only inside the guardrails.",
    labels: VULN_LABEL,
    title: "Vulnerability fixes started by wovain ops",
  });
};

const vulnState = async () => {
  const [vulns, log] = await Promise.all([gitlab.vulnerabilities(), vulnLog()]);
  const notes = await gitlab.issueNotes(log.iid);
  return { log, started: startedVulns(notes), vulns };
};

// Hands new High and Critical findings to Duo Vulnerability Resolution.
const vulnFixes = async () => {
  const { log, started, vulns } = await vulnState();
  const picked = pickVulns(vulns, started, now);
  const results = await Promise.all(
    picked.map(async (v) => {
      const failed = await bestEffort("Vulnerability Resolution", () =>
        gitlab.resolveVulnerability(v.id)
      );
      if (failed.length > 0) {
        return failed[0] ?? "failed";
      }
      await gitlab.noteOnIssue(
        log.iid,
        `Started Duo Vulnerability Resolution for a ${v.severity} finding: ${v.webUrl}\n\n${startedMarker(v.id)}`
      );
      return `started for ${v.id}`;
    })
  );
  return `${vulns.length} open High/Critical SAST finding(s); ${results.length === 0 ? "none to start" : results.join("; ")}`;
};

const once = async (mr: number, notes: Note[], kind: string, body: string) => {
  if (!hasMarker(notes, kind)) {
    await gitlab.noteOnMergeRequest(mr, `${body}\n\n${marker(kind)}`);
  }
};

const handBack = async (mr: number, notes: Note[], reasons: string[]) => {
  await once(
    mr,
    notes,
    "needs-human",
    `wovain ops won't auto-merge this, so it needs a person:\n\n${reasons.map((r) => `- ${r}`).join("\n")}`
  );
  return `needs a person: ${reasons.join("; ")}`;
};

// Duo Code Review for the head commit, added next to existing reviewers.
const requestReview = async (mr: MergeRequest, notes: Note[]) => {
  const id = await gitlab.userId(reviewer);
  const others = mr.reviewers.flatMap((r) => (r.id === id ? [] : [r.id]));
  await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: others });
  await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: [...others, id] });
  await once(
    mr.iid,
    notes,
    `review:${mr.sha}`,
    `Duo Code Review requested for ${mr.sha} by wovain ops.`
  );
};

// The agent::task or heal issue this MR closes, which the ops job handed to
// the MR's author. GitLab's closing link is used, never text in the MR.
const boundIssue = async (
  mr: MergeRequest,
  vulnLogIssue: Issue | undefined
) => {
  if (vulnLogIssue !== undefined) {
    return vulnLogIssue;
  }
  const closes = await gitlab.closesIssues(mr.iid);
  return closes.find(
    (i) =>
      (i.labels.includes(TASK_LABEL) || i.labels.includes(HEAL_LABEL)) &&
      i.assignees.some((a) => a.username === mr.author.username)
  );
};

// A heal MR carries its issue's signature, which heal:verify tests against.
const signatureBlockers = (mr: MergeRequest, issue: Issue) => {
  const expected = parseSignature(issue.description)?.fingerprint;
  const carried = parseSignature(mr.description)?.fingerprint;
  return issue.labels.includes(HEAL_LABEL) && carried !== expected
    ? [`its description lacks #${issue.iid}'s heal signature`]
    : [];
};

// The head commit has no finished review: ask once, then wait, and hand a
// review that never lands to a person.
const awaitReview = async (mr: MergeRequest, notes: Note[]) => {
  const asked = notes.find((n) => n.body.includes(marker(`review:${mr.sha}`)));
  if (asked === undefined) {
    await requestReview(mr, notes);
    return "review requested";
  }
  return now.getTime() - Date.parse(asked.created_at) > REVIEW_TIMEOUT_MS
    ? await handBack(mr.iid, notes, ["Duo Code Review didn't finish"])
    : "review running";
};

const shepherdOne = async (
  listed: MergeRequest,
  vulnLogIssue: Issue | undefined
) => {
  if (listed.merge_when_pipeline_succeeds) {
    return "auto-merge already set";
  }
  const [mr, notes, diffs, versions, reviewers, discussions, issue] =
    await Promise.all([
      gitlab.mergeRequest(listed.iid),
      gitlab.mergeRequestNotes(listed.iid),
      gitlab.diffs(listed.iid),
      gitlab.versions(listed.iid),
      gitlab.reviewers(listed.iid),
      gitlab.discussions(listed.iid),
      boundIssue(listed, vulnLogIssue),
    ]);
  if (issue === undefined) {
    return await handBack(mr.iid, notes, [
      "doesn't close an agent::task or heal issue that wovain ops assigned to its author, and isn't a Vulnerability Resolution it started",
    ]);
  }
  const paths = diffs.flatMap((d) => [d.old_path, d.new_path]);
  const lines = diffs.reduce((sum, d) => sum + diffLines(d.diff), 0);
  const scope = [
    ...scopeBlockers({ lines, paths }),
    ...signatureBlockers(mr, issue),
  ];
  if (scope.length > 0) {
    return await handBack(mr.iid, notes, scope);
  }
  if (now.getTime() - Date.parse(mr.updated_at) < SETTLE_MS) {
    return "settling";
  }
  if (mr.draft) {
    await gitlab.updateMergeRequest(mr.iid, {
      title: mr.title.replace(/^\s*(?:\[draft\]|\(draft\)|draft:)\s*/iu, ""),
    });
    await requestReview(mr, notes);
    return "marked ready, review requested";
  }
  const duo = reviewers.find((r) => r.user.username === reviewer);
  const reviewedSha = reviewedShaOf(
    notes.map((n) => ({
      author: n.author.username,
      createdAt: n.created_at,
      headSha: n.position?.head_sha,
    })),
    versions.map((v) => ({
      createdAt: v.created_at,
      headSha: v.head_commit_sha,
    })),
    reviewer
  );
  if (reviewedSha !== mr.sha || !reviewDone(duo?.state)) {
    return await awaitReview(mr, notes);
  }
  const pipeline =
    mr.head_pipeline?.sha === mr.sha ? mr.head_pipeline.status : undefined;
  const unresolved =
    openThreads(discussions, reviewer) +
    (duo?.state === "requested_changes" ? 1 : 0);
  const reasons = blockers({
    draft: mr.draft,
    hasConflicts: mr.has_conflicts,
    lines,
    outsiders: outsidersOf(discussions, [
      reviewer,
      mr.author.username,
      ...trusted,
    ]),
    paths,
    pipeline,
    reviewedSha,
    reviewerState: duo?.state,
    sha: mr.sha,
    unresolved,
  });
  if (reasons.length === 0) {
    await gitlab.setAutoMerge(mr.iid, mr.sha);
    await gitlab.noteOnMergeRequest(
      mr.iid,
      `Auto-merge set by wovain ops for ${mr.sha}: it closes #${issue.iid}, Duo Code Review reviewed this commit with no open threads, and the change stays inside the guardrails (apps/ops/src/guardrails.ts). GitLab merges it once the pipeline passes.\n\n${marker("auto-merge")}`
    );
    if (issue.labels.includes(HEAL_LABEL)) {
      await tellIncidents(
        issue.iid,
        `Fix ${mr.web_url} reviewed by Duo Code Review and set to auto-merge.`,
        false
      );
    }
    return "auto-merge set";
  }
  if (unresolved > 0 && reasons.every((r) => r.includes("review thread"))) {
    await once(
      mr.iid,
      notes,
      "fix-review",
      `@${mr.author.username} please address the open Duo Code Review threads and resolve each one.`
    );
    return "asked the author to address review threads";
  }
  return await handBack(mr.iid, notes, reasons);
};

const shepherd = async () => {
  const [byAuthor, vulns] = await Promise.all([
    Promise.all(
      [developer, healer].map(
        async (author) =>
          await gitlab.mergeRequests({
            author_username: author,
            state: "opened",
          })
      )
    ),
    vulnState(),
  ]);
  const vulnIids = new Set(vulnMergeRequests(vulns.vulns, vulns.started));
  const fromVulns = await Promise.all(
    [...vulnIids].map(async (iid) => await gitlab.mergeRequest(iid))
  );
  const mrs = [
    ...byAuthor.flat(),
    ...fromVulns.filter((mr) => mr.state === "opened"),
  ];
  const outcomes = await Promise.allSettled(
    mrs.map(
      async (mr) =>
        await shepherdOne(mr, vulnIids.has(mr.iid) ? vulns.log : undefined)
    )
  );
  return Object.fromEntries(
    mrs.map((mr, i) => {
      const outcome = outcomes[i];
      return [
        mr.iid,
        outcome?.status === "fulfilled"
          ? outcome.value
          : `failed: ${outcome?.reason instanceof Error ? outcome.reason.message : "unknown"}`,
      ];
    })
  );
};

// The public status page: health, incidents, DORA and SCI (status.ts).
const statusPage = async () => {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [incidents, deployments, leadTimeSeconds, recent, sci] =
    await Promise.all([
      gitlab.issues({
        created_after: since.toISOString(),
        issue_type: "incident",
        state: "all",
      }),
      gitlab.deployments(since),
      gitlab.doraLeadTime(since),
      google.entries(errorFilter, {
        end: now,
        start: new Date(now.getTime() - WATCH_MS),
      }),
      gitlab
        .inProject(sciSchema, "GET", "jobs/artifacts/main/raw/sci.json", {
          job: "sci",
        })
        .catch(() => null),
    ]);
  const rows = incidents.map((i) => ({
    closedAt: i.closed_at ?? undefined,
    createdAt: i.created_at,
    iid: i.iid,
    state: i.state,
    title: i.title,
  }));
  const health = healthOf(
    rows.filter((r) => r.state === "opened").length,
    recent.entries.length
  );
  await mkdir("public", { recursive: true });
  await writeFile(
    "public/index.html",
    renderStatus({
      dora: doraOf({
        deployments: deployments.map((d) => ({ createdAt: d.created_at })),
        incidents: rows,
        leadTimeSeconds: leadTimeSeconds ?? undefined,
        now,
      }),
      generatedAt: now,
      health,
      incidents: rows,
      sciPerThousand: sci?.perThousand ?? undefined,
    })
  );
  return `${health}, ${rows.length} incident(s) in 30 days`;
};

const phases = { heal, intake, shepherd, statusPage, verifyHeals, vulnFixes };
const results = await Promise.allSettled(
  Object.values(phases).map(async (phase) => await phase())
);
let failed = false;
for (const [i, name] of Object.keys(phases).entries()) {
  const result = results[i];
  if (result?.status === "fulfilled") {
    console.log(`${name}:`, JSON.stringify(result.value, null, 2));
  } else {
    failed = true;
    console.error(
      `${name} failed:`,
      result?.reason instanceof Error ? result.reason.message : "unknown"
    );
  }
}
if (failed) {
  process.exitCode = 1;
}
