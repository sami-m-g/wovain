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
  posthogGroupOf,
  verdict,
} from "./heal.ts";
import type { ErrorGroup } from "./heal.ts";
import { TASK_LABEL, taskBlocker, taskBudget } from "./intake.ts";
import { loadKpis } from "./kpis.ts";
import { exceptionsQuery, issueEventsQuery, scalarOf } from "./posthog.ts";
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
  VULN_LABEL,
  isUnavailable,
  pickVulns,
  planVulnTasks,
  resolutionUnavailable,
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
//   shepherd Duo's MRs → ready → Duo Code Review → guardrails → auto-merge
//   status   public/index.html for the status page (the pages job publishes it)
//   signals  PostHog KPI alerts firing → the scout flow, at most once a day
//   verifyKpis merged kpi-scout changes → KPI alert stopped? → verified
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
    description: healBody(problem, "30 min", evidenceOf(problem)),
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
    `${errorFilter} AND jsonPayload.path="${signature.path}"`,
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
          await gitlab.updateIssue(issue.iid, { state_event: "reopen" });
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
      updated_after: new Date(now.getTime() - 14 * DAY_MS).toISOString(),
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
        add_labels:
          result === "verified" ? KPI_VERIFIED_LABEL : KPI_MISSED_LABEL,
      });
      return [issue.iid, result];
    })
  );
  return Object.fromEntries(results);
};

const phases = {
  heal,
  intake,
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
