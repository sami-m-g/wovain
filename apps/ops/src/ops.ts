import { mkdir, writeFile } from "node:fs/promises";

import { z } from "zod";

import { opsContext } from "./context.ts";
import { ENV } from "./env.ts";
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
  posthogGroupOf,
  verdict,
} from "./heal.ts";
import type { ErrorGroup } from "./heal.ts";
import { TASK_LABEL, taskBlocker, taskBudget } from "./intake.ts";
import { loadKpis } from "./kpis.ts";
import { exceptionsQuery, issueEventsQuery, scalarOf } from "./posthog.ts";
import {
  FLAG_CLEANUP_LABEL,
  RELEASE_GUARD_LABEL,
  RELEASE_GUARD_MARKER,
  cleanupBody,
  cleanupMarker,
  guardDecision,
  hygieneFindings,
  releaseGuardBody,
} from "./release.ts";
import { DUO_USER, MAX_REREVIEWS, rereviewOf } from "./rereview.ts";
import { fromRoot } from "./root.ts";
import {
  KPI_MISSED_LABEL,
  KPI_SCOUT_LABEL,
  KPI_VERIFIED_LABEL,
  firingKpis,
  kpiOfTitle,
  kpiVerdict,
  scoutDue,
} from "./signals.ts";
import { doraOf, healthOf, renderStatus } from "./status.ts";
import {
  RESOLVE_COMMENT,
  VULN_LABEL,
  isUnavailable,
  pickGone,
  pickVulns,
  planVulnTasks,
  resolutionUnavailable,
  resolvedNote,
  startedMarker,
  startedVulns,
  unavailableNote,
  vulnMergeRequests,
  vulnTaskBody,
  vulnTaskTitle,
} from "./vulns.ts";

// The ops job (.gitlab/ci/ops.yml), every 10 minutes on the "wovain ops"
// pipeline schedule. It moves the self-healing and issue-to-completion flows
// along with GITLAB_TOKEN, a person's token, because GitLab starts a flow
// only for a human's action:
//   heal     production errors → heal issue → assigned to the heal flow
//   verify   merged heal fixes → production clean? → verified, or reopened
//            and an incident for each, closed when production confirms
//   intake   agent::task issues → checks and caps → assigned to Developer
//   vulns    new High/Critical SAST findings → Duo Vulnerability Resolution,
//            or, where it's unavailable, agent::task issues → Developer
//   resolve  findings no longer detected on the default branch → Resolved
//   shepherd Duo's MRs → ready → Duo Code Review → guardrails → auto-merge
//   rereview any open MR GitLab Duo requested changes on → its threads
//            resolved, pipeline green → Duo re-reviews, and approves when it
//            finds nothing new (rereview.ts)
//   status   public/index.html for the status page (the pages job publishes it)
//   signals  PostHog KPI alerts firing → the scout flow, at most once a day
//   verifyKpis merged kpi-scout changes → KPI alert stopped? → verified
//   releaseGuard production degraded after a flag change or deploy → flag
//            off, or a ROLLBACK=1 pipeline → release-guard issue → the
//            wovain release-guard flow diagnoses (docs/adr/0001-...)
//   flagHygiene expired, finished or unregistered feature flags → cleanup
//            issues for their owners
// PostHog destinations also start it right away (infra/posthog/signals.tf);
// it reads PostHog itself, so what started it never steers it.
// It never merges anything itself; GitLab merges once the pipeline passes.

const WATCH_MS = 30 * 60_000;
const sciSchema = z.object({ perThousand: z.number().nullable().optional() });
const SETTLE_MS = 10 * 60_000;
const REVIEW_TIMEOUT_MS = 2 * 3_600_000;
const DAY_MS = 86_400_000;

const { env, gitlab, google, posthog } = opsContext();
const config = await loadKpis();
const now = new Date();
const me = await gitlab.currentUser();
const trusted = new Set([me.username, ...env.TRUSTED_USERS]);
const developer = env.DUO_DEVELOPER_ACCOUNT;
const healer = env.DUO_HEAL_ACCOUNT;
const reviewer = env.DUO_REVIEW_ACCOUNT;
// Production's service, and dev.wovain.com's (infra/dev.ts): both run the
// same code and read the same GitLab flags, so errors on either are healed
// and can trip the release guard's kill switch.
const DEV_SERVICE = "wovain-web-dev";
const bothServices = (filter: string) =>
  filter.replace(
    'resource.labels.service_name="wovain-web"',
    `resource.labels.service_name=("wovain-web" OR "${DEV_SERVICE}")`
  );
const ERROR_LINES = 'jsonPayload.level="error" AND jsonPayload.error.name:*';
// heal finds errors on both services (dev.wovain.com runs the fault flag);
// the status page and verifyHeals measure production alone, since a fix
// deploys to production and dev is rolled out by hand.
const errorFilter = `${bothServices(config.service.logs)} AND ${ERROR_LINES}`;
const productionErrorFilter = `${config.service.logs} AND ${ERROR_LINES}`;

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
        await gitlab.updateIssue(incident.iid, { stateEvent: "close" });
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
  await gitlab.updateIssue(issue, { assigneeIds: [id] });
};

// Browser exceptions PostHog error tracking grouped in the watch window.
const browserErrors = async (): Promise<ErrorGroup[]> => {
  if (posthog === undefined) {
    return [];
  }
  const rows = await posthog.rows(exceptionsQuery(WATCH_MS / 60_000));
  return rows.flatMap((row) => posthogGroupOf(row) ?? []);
};

// Where the heal issue's error was seen: PostHog's error tracking issue (its
// stack, sessions and replays) or the Cloud Logging query.
const evidenceOf = ({ signature: s }: ErrorGroup) =>
  s.posthogIssue === undefined || posthog === undefined
    ? `[Cloud Logging](${logsUrl(`${errorFilter} AND jsonPayload.path="${s.path}"`)})`
    : `[PostHog error tracking](${posthog.link(`error_tracking/${s.posthogIssue}`)})`;

// Flow 1: file the most frequent new production error, from the server's
// logs or PostHog's browser exceptions, and hand it to the heal flow, within
// the daily and in-flight caps.
const heal = async () => {
  const range = { end: now, start: new Date(now.getTime() - WATCH_MS) };
  const [{ entries }, browser] = await Promise.all([
    google.entries(errorFilter, range),
    browserErrors(),
  ]);
  const groups = [...groupErrors(entries), ...browser].toSorted(
    (a, b) => b.count - a.count
  );
  const issues = await gitlab.issues({
    labels: HEAL_LABEL,
    state: "all",
    updatedAfter: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
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
    description: healBody(problem, "30 min", evidenceOf(problem)),
    labels: `${HEAL_LABEL},type::bug`,
    title: healTitle(s),
  });
  await assignTo(created.iid, healer);
  // The incident people follow; the heal issue is what Duo works on.
  const incident = await gitlab.createIssue({
    confidential: true,
    description: incidentBody(problem, created.iid),
    issueType: "incident",
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

// When the latest merge request that closed an issue merged.
const mergedAtOf = async (issue: number) => {
  const related = await gitlab.relatedMergeRequests(issue);
  const [mergedAt] = related
    .flatMap((m) => (m.merged_at ? [Date.parse(m.merged_at)] : []))
    .toSorted((a, b) => b - a);
  return mergedAt;
};

// Events with a heal signature since `start`: PostHog's count for its error
// tracking issue, or the signature's count in Cloud Logging.
const eventsSince = async (
  signature: NonNullable<ReturnType<typeof parseSignature>>,
  start: Date
) => {
  if (start >= now) {
    return 0;
  }
  if (signature.posthogIssue !== undefined) {
    if (posthog === undefined) {
      throw new Error(
        "PostHog isn't configured, so a browser fix can't be verified"
      );
    }
    const rows = await posthog.rows(
      issueEventsQuery(signature.posthogIssue, start)
    );
    return scalarOf(rows) ?? 0;
  }
  const { entries } = await google.entries(
    `${productionErrorFilter} AND jsonPayload.path="${signature.path}"`,
    { end: now, start }
  );
  return (
    groupErrors(entries).find(
      (g) => g.signature.fingerprint === signature.fingerprint
    )?.count ?? 0
  );
};

// Flow 1, after the merge: production must stay clean of the signature.
const verifyOne = async (issue: Issue) => {
  const signature = parseSignature(issue.description);
  const mergedAt = await mergedAtOf(issue.iid);
  if (signature === undefined || mergedAt === undefined) {
    return "skip: no signature or no merged MR";
  }
  const events = await eventsSince(
    signature,
    new Date(mergedAt + DEPLOY_GRACE_MS)
  );
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
    await gitlab.updateIssue(issue.iid, { addLabels: VERIFIED_LABEL });
    await tellIncidents(
      issue.iid,
      `Resolved: the fix for #${issue.iid} is verified in production, no \`${signature.fingerprint}\` errors in ${result.minutes} minutes.`,
      true
    );
  } else if (result.kind === "regressed") {
    await gitlab.updateIssue(issue.iid, { stateEvent: "reopen" });
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
    updatedAfter: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
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
  const listed = await gitlab.issues({ labels: VULN_LABEL, state: "opened" });
  // The per-finding task issues carry vuln-fix too; the log doesn't.
  const found = listed.find((i) => !i.labels.includes(TASK_LABEL));
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
  return { log, notes, started: startedVulns(notes), vulns };
};

type Finding = Awaited<ReturnType<typeof gitlab.vulnerabilities>>[number];

// Starts Vulnerability Resolution for each picked finding, one at a time;
// stops at GitLab's "not available here" and records it on the log issue.
const resolveVulns = async (log: Issue, picked: Finding[]) => {
  const results: string[] = [];
  for (const v of picked) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- stop at the first "unavailable"
      await gitlab.resolveVulnerability(v.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (isUnavailable(message)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- once, then stop
        await gitlab.noteOnIssue(log.iid, unavailableNote(message));
        return { results, unavailable: true };
      }
      results.push(`Vulnerability Resolution failed for ${v.id}: ${message}`);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- same finding
    await gitlab.noteOnIssue(
      log.iid,
      `Started Duo Vulnerability Resolution for a ${v.severity} finding: ${v.webUrl}\n\n${startedMarker(v.id)}`
    );
    results.push(`Vulnerability Resolution started for ${v.id}`);
  }
  return { results, unavailable: false };
};

// The fallback: one agent::task + vuln-fix issue per finding (vulns.ts),
// which intake hands to the Developer flow.
const fileVulnTasks = async (
  vulns: Finding[],
  started: Map<string, string>
) => {
  const tasks = await gitlab.issues({
    labels: `${TASK_LABEL},${VULN_LABEL}`,
    state: "all",
  });
  const plan = planVulnTasks({
    now,
    tasks,
    vulns: vulns.filter((v) => !started.has(v.id)),
  });
  const filed = await Promise.all([
    ...plan.create.map(
      async (v) =>
        await bestEffort(`task issue for ${v.id}`, () =>
          gitlab.createIssue({
            confidential: true,
            description: vulnTaskBody(v),
            labels: `${TASK_LABEL},${VULN_LABEL}`,
            title: vulnTaskTitle(v),
          })
        )
    ),
    ...plan.reopen.map(
      async ({ issue, vuln }) =>
        await bestEffort(`reopening #${issue.iid}`, async () => {
          await gitlab.updateIssue(issue.iid, { stateEvent: "reopen" });
          await gitlab.noteOnIssue(
            issue.iid,
            `Reopened: the latest default-branch scan still reports ${vuln.webUrl}.`
          );
        })
    ),
  ]);
  return [
    `Vulnerability Resolution unavailable: ${plan.open} task issue(s) open, ${plan.create.length} to file, ${plan.reopen.length} to reopen`,
    ...filed.flat(),
  ];
};

// Hands new High and Critical findings to Duo Vulnerability Resolution, or,
// where this project can't use it, to the Developer flow through task
// issues. Each part reports its own status; neither fails the phase.
const vulnFixes = async () => {
  const { log, notes, started, vulns } = await vulnState();
  const report = [`${vulns.length} open High/Critical SAST finding(s)`];
  let unavailable = resolutionUnavailable(notes, now);
  if (!unavailable) {
    const picked = pickVulns(vulns, started, now);
    const resolved = await resolveVulns(log, picked);
    report.push(
      ...(picked.length === 0 ? ["none to start"] : resolved.results)
    );
    ({ unavailable } = resolved);
  }
  if (unavailable) {
    report.push(...(await fileVulnTasks(vulns, started)));
  }
  return report.join("; ");
};

// Resolves findings the default-branch scan no longer reports (vulns.ts),
// one at a time, logging each on the vuln-fix issue.
const resolveGone = async () => {
  const [gone, log] = await Promise.all([gitlab.noLongerDetected(), vulnLog()]);
  const picked = pickGone(gone);
  const results: string[] = [];
  for (const v of picked) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one at a time, under the cap
    const failed = await bestEffort(`resolving ${v.id}`, async () => {
      await gitlab.resolveFinding(v.id, RESOLVE_COMMENT);
      await gitlab.noteOnIssue(log.iid, resolvedNote(v));
    });
    results.push(...failed);
  }
  const resolved = picked.length - results.length;
  return [
    `${gone.length} no longer detected; ${resolved} resolved`,
    ...results,
  ].join("; ");
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
  await gitlab.updateMergeRequest(mr.iid, { reviewerIds: others });
  await gitlab.updateMergeRequest(mr.iid, { reviewerIds: [...others, id] });
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
            authorUsername: author,
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

// GitLab Duo's change request on one merge request: re-request its review
// once its threads are resolved and the pipeline passed (rereview.ts).
const rereviewOne = async (iid: number, duoId: number) => {
  const [mr, notes, reviewers, discussions] = await Promise.all([
    gitlab.mergeRequest(iid),
    gitlab.mergeRequestNotes(iid),
    gitlab.reviewers(iid),
    gitlab.discussions(iid),
  ]);
  // Notes come newest first: this is Duo's latest change request.
  const request = notes.find(
    (n) =>
      n.system &&
      n.author.username === DUO_USER &&
      n.body.trim() === "requested changes"
  );
  const decision = rereviewOf({
    asked: notes.filter((n) => n.body.includes(marker("duo-rereview"))).length,
    askedForThis:
      request !== undefined && hasMarker(notes, `duo-rereview:${request.id}`),
    draft: mr.draft,
    openThreads: openThreads(discussions, DUO_USER),
    pipeline:
      mr.head_pipeline?.sha === mr.sha ? mr.head_pipeline.status : undefined,
    requestId: request?.id,
    state: reviewers.find((r) => r.user.username === DUO_USER)?.state,
  });
  if (decision.action === "wait") {
    return decision.reason;
  }
  if (decision.action === "cap") {
    await once(
      iid,
      notes,
      "duo-rereview-cap",
      `GitLab Duo still requests changes after ${MAX_REREVIEWS} re-reviews by wovain ops, so a person decides: reply on its threads and re-request its review, or bypass the request in the merge checks.`
    );
    return "re-review cap reached";
  }
  await gitlab.rereview(iid, duoId);
  // "duo-rereview" counts the re-reviews; the second marker names the
  // change request this one answers.
  await gitlab.noteOnMergeRequest(
    iid,
    `Every GitLab Duo thread is resolved and the pipeline passed for ${mr.sha}, so wovain ops re-requested its review. Duo approves when it finds nothing new, which clears its change request.\n\n${marker("duo-rereview")}${marker(`duo-rereview:${request?.id}`)}`
  );
  return `re-review requested for ${mr.sha}`;
};

// Every open merge request with GitLab Duo as a reviewer, a person's or Duo's.
const rereview = async () => {
  const mrs = await gitlab.mergeRequests({ state: "opened", wip: "no" });
  const withDuo = mrs.flatMap((mr) => {
    const duo = mr.reviewers.find((r) => r.username === DUO_USER);
    return duo === undefined ? [] : [{ duoId: duo.id, iid: mr.iid }];
  });
  const outcomes = await Promise.allSettled(
    withDuo.map(async ({ duoId, iid }) => await rereviewOne(iid, duoId))
  );
  return Object.fromEntries(
    withDuo.map(({ iid }, i) => {
      const outcome = outcomes[i];
      return [
        iid,
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
        createdAfter: since.toISOString(),
        issueType: "incident",
        state: "all",
      }),
      gitlab.deployments(since),
      gitlab.doraLeadTime(since),
      google.entries(productionErrorFilter, {
        end: now,
        start: new Date(now.getTime() - WATCH_MS),
      }),
      gitlab
        .latestArtifactJson(sciSchema, "main", "sci", "sci.json")
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
  await mkdir(fromRoot("public"), { recursive: true });
  await writeFile(
    fromRoot("public/index.html"),
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

// The PostHog loop, Plan: KPI alerts firing in PostHog start the scout flow
// early, at most once a day; the note on the snapshot issue is the record.
const signals = async () => {
  if (posthog === undefined) {
    return "PostHog isn't configured";
  }
  const firing = firingKpis(await posthog.alerts());
  if (firing.length === 0) {
    return "no KPI alert firing";
  }
  const [snapshot] = await gitlab.issues({
    labels: "kpi-snapshot",
    state: "opened",
  });
  if (snapshot === undefined) {
    return `firing: ${firing.join(", ")}; waits for the first scheduled scout`;
  }
  const notes = await gitlab.issueNotes(snapshot.iid);
  const last = notes.find((n) => n.body.includes(marker("scout-started")));
  if (!scoutDue(last ? new Date(last.created_at) : undefined, now)) {
    return `firing: ${firing.join(", ")}; the scout already ran early today`;
  }
  const pipeline = await gitlab.runPipeline("main", { SCOUT: "1" });
  await gitlab.noteOnIssue(
    snapshot.iid,
    `PostHog KPI alerts firing: ${firing.map((id) => `\`${id}\``).join(", ")}. Started the scout early: ${pipeline.web_url}\n\n${marker("scout-started")}`
  );
  return `firing: ${firing.join(", ")}; started the scout ${pipeline.web_url}`;
};

// The PostHog loop, Monitor: a kpi-scout change that merged is verified when
// its KPI's alert stops firing, and marked missed if it still fires a week on.
const verifyKpis = async () => {
  if (posthog === undefined) {
    return "PostHog isn't configured";
  }
  const [alerts, closed] = await Promise.all([
    posthog.alerts(),
    gitlab.issues({
      labels: KPI_SCOUT_LABEL,
      state: "closed",
      updatedAfter: new Date(now.getTime() - 14 * DAY_MS).toISOString(),
    }),
  ]);
  const pending = closed.filter(
    (i) =>
      !i.labels.includes(KPI_VERIFIED_LABEL) &&
      !i.labels.includes(KPI_MISSED_LABEL)
  );
  const results = await Promise.all(
    pending.map(async (issue) => {
      const kpi = kpiOfTitle(issue.title);
      const alert = alerts.find((a) => a.name === `kpi:${kpi}`);
      const mergedAt = await mergedAtOf(issue.iid);
      if (alert === undefined || mergedAt === undefined) {
        return [issue.iid, "skip: no PostHog KPI alert or no merged MR"];
      }
      const result = kpiVerdict({ alert, mergedAt: new Date(mergedAt), now });
      if (result === "wait") {
        return [issue.iid, `waits: ${alert.state}`];
      }
      const insight = alert.insight?.short_id;
      const link =
        insight === undefined
          ? ""
          : ` ([insight](${posthog.link(`insights/${insight}`)}))`;
      await gitlab.noteOnIssue(
        issue.iid,
        result === "verified"
          ? `Verified in PostHog: \`${kpi}\` meets its target again; its alert stopped firing after the change merged${link}.`
          : `PostHog still shows \`${kpi}\` missing its target a week after the change merged${link}. @${me.username} please decide what's next.`
      );
      await gitlab.updateIssue(issue.iid, {
        addLabels:
          result === "verified" ? KPI_VERIFIED_LABEL : KPI_MISSED_LABEL,
      });
      return [issue.iid, result];
    })
  );
  return Object.fromEntries(results);
};

// Progressive delivery, after the canary (docs/adr/0001-progressive-
// delivery.md): when production degrades and a guarded flag changed in the
// last 2 hours, switch it off (the kill switch); when a deploy did, start a
// ROLLBACK=1 pipeline, whose rollback:production job moves traffic back as
// the deploy account. Either way a release-guard issue, assigned to the
// wovain release-guard flow, carries the evidence. One action an hour,
// three a day; nothing is switched back on automatically.
const GUARD_WATCH_MS = 15 * 60_000;
const guardAccount = env.DUO_RELEASE_GUARD_ACCOUNT;
const assignGuardIssues = async (issues: Issue[]) => {
  if (guardAccount === undefined || guardAccount === "") {
    return { assigned: [], problems: ["DUO_RELEASE_GUARD_ACCOUNT isn't set"] };
  }
  const waiting = issues.filter(
    (i) =>
      i.state === "opened" &&
      i.assignees.length === 0 &&
      (i.description ?? "").includes(RELEASE_GUARD_MARKER)
  );
  // Best effort: a missing flow account never blocks the mitigation.
  const problems = await Promise.all(
    waiting.map(
      async (i) =>
        await bestEffort(`assigning #${i.iid}`, () =>
          assignTo(i.iid, guardAccount)
        )
    )
  );
  return { assigned: waiting.map((i) => i.iid), problems: problems.flat() };
};

const releaseGuard = async () => {
  const range = { end: now, start: new Date(now.getTime() - GUARD_WATCH_MS) };
  const requests = `${config.service.metrics} AND log_id("run.googleapis.com/requests")`;
  const devRequests = requests.replace(
    'service_name="wovain-web"',
    `service_name="${DEV_SERVICE}"`
  );
  const [
    all,
    failed,
    devAll,
    devFailed,
    flags,
    deployments,
    issues,
    browser,
    alerts,
  ] = await Promise.all([
    google.entries(requests, range),
    google.entries(`${requests} AND httpRequest.status>=500`, range),
    google.entries(devRequests, range),
    google.entries(`${devRequests} AND httpRequest.status>=500`, range),
    gitlab.featureFlags(),
    gitlab.deployments(new Date(now.getTime() - DAY_MS)),
    gitlab.issues({
      createdAfter: new Date(now.getTime() - DAY_MS).toISOString(),
      labels: RELEASE_GUARD_LABEL,
      state: "all",
    }),
    browserErrors(),
    posthog === undefined ? Promise.resolve([]) : posthog.alerts(),
  ]);
  const assigned = await assignGuardIssues(issues);
  const [deployment] = deployments;
  const health = {
    errors: failed.entries.length,
    requests: all.entries.length,
  };
  const devHealth = {
    errors: devFailed.entries.length,
    requests: devAll.entries.length,
  };
  const exceptions = browser.reduce((sum, g) => sum + g.count, 0);
  const kpis = firingKpis(alerts);
  const decision = guardDecision({
    actions: issues
      .map((i) => new Date(i.created_at))
      .toSorted((a, b) => b.getTime() - a.getTime()),
    // When the deploy finished: the canary job starts after it.
    deployedAt:
      deployment === undefined
        ? undefined
        : new Date(deployment.finished_at ?? deployment.created_at),
    devHealth,
    exceptions,
    firingKpis: kpis,
    flags,
    health,
    now,
  });
  if (decision.action === "none") {
    return { assigned, decision: decision.reasons.join("; ") };
  }
  const evidence = [
    `Production 5xx in the last 15 minutes: ${health.errors}/${health.requests} ([Cloud Logging](${logsUrl(`${requests} AND httpRequest.status>=500`)}))`,
    `dev.wovain.com 5xx in the last 15 minutes: ${devHealth.errors}/${devHealth.requests} ([Cloud Logging](${logsUrl(`${devRequests} AND httpRequest.status>=500`)}))`,
    `PostHog error tracking: ${exceptions} browser exceptions in 30 minutes${posthog === undefined ? "" : ` ([issues](${posthog.link("error_tracking")}))`}`,
    `PostHog KPI alerts firing: ${kpis.length > 0 ? kpis.map((k) => `\`kpi:${k}\``).join(", ") : "none"}`,
    `Latest production deployment: ${deployment?.created_at ?? "none in 24 hours"}`,
    `Feature flags: https://gitlab.com/${ENV.CI_PROJECT_PATH ?? ""}/-/feature_flags`,
  ];
  let action = "";
  if (decision.action === "flag-off") {
    await gitlab.setFeatureFlagActive(decision.flag, false);
    action = `feature flag \`${decision.flag}\` switched off`;
  } else {
    const pipeline = await gitlab.runPipeline("main", { ROLLBACK: "1" });
    action = "traffic rolled back to the previous revision";
    evidence.push(`Rollback pipeline: ${pipeline.web_url}`);
  }
  const issue = await gitlab.createIssue({
    description: releaseGuardBody({
      action,
      evidence,
      reasons: decision.reasons,
      source: ENV.CI_JOB_URL ?? "the ops job",
    }),
    labels: `${RELEASE_GUARD_LABEL},stage::release`,
    title: `Release guard: ${action}`,
  });
  const handoff = await assignGuardIssues([issue]);
  return { action, handoff, issue: issue.web_url };
};

// Flag hygiene: one cleanup issue per expired, fully rolled out or
// unregistered flag, for its owner, at most three a run; a flag gets a new
// one only a month after the last.
const flagHygiene = async () => {
  const [flags, known] = await Promise.all([
    gitlab.featureFlags(),
    gitlab.issues({
      labels: FLAG_CLEANUP_LABEL,
      state: "all",
      updatedAfter: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    }),
  ]);
  const findings = hygieneFindings(flags, now);
  const fresh = findings
    .filter(
      (f) =>
        !known.some((i) => (i.description ?? "").includes(cleanupMarker(f)))
    )
    .slice(0, 3);
  const filed = await Promise.all(
    fresh.map(async (finding) => {
      const issue = await gitlab.createIssue({
        description: cleanupBody(finding),
        labels: `${FLAG_CLEANUP_LABEL},type::chore`,
        title: `Clean up feature flag ${finding.flag}: ${finding.problem}`,
      });
      return issue.web_url;
    })
  );
  return { filed, findings: findings.length };
};

const phases = {
  flagHygiene,
  heal,
  intake,
  releaseGuard,
  rereview,
  resolveGone,
  shepherd,
  signals,
  statusPage,
  verifyHeals,
  verifyKpis,
  vulnFixes,
};
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
