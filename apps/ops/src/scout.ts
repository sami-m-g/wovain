import type { GitLab, Issue, Note } from "./gitlab.ts";
import { REQUESTS } from "./google.ts";
import type { Google, Range } from "./google.ts";
import type { O11y } from "./o11y.ts";
import { fingerprintIn, issueBody, marker, verdictNote } from "./report.ts";
import {
  decideVerification,
  groupSignals,
  humanReasons,
  titleOf,
} from "./signals.ts";
import type { Problem, Window } from "./signals.ts";

// The scout: reads production's errors, files one intent per new problem for
// the Duo Developer flow, and after a fix ships checks that the error rate
// dropped. Issues are built only from allowlisted, server-controlled fields
// (signals.ts); a problem that fails the allowlist, or that only GitLab
// Observability saw, is filed as status::intent for a human and never handed
// to Duo. Credits are spent only by the Developer flow, so the scout files
// at most one issue a run and keeps at most MAX_ACTIVE problems with Duo.

export const DEVELOPER = "duo-developer-gitlab-ai-hackathon";
const LOOKBACK_HOURS = 6;
const MIN_COUNT = 3;
const MAX_ACTIVE = 2;
const MAX_ATTEMPTS = 2;
const HOUR = 3_600_000;

export interface Sources {
  gitlab: GitLab;
  google: Google;
  o11y: O11y | undefined;
}

const problemsIn = async (
  { google, o11y }: Sources,
  range: Range
): Promise<Problem[]> => {
  // GitLab Observability is optional: if its query fails, Google's signals
  // still count, and the failure is logged without the response body.
  const fromO11y = async () => {
    try {
      return (await o11y?.errors(range)) ?? [];
    } catch (error) {
      console.error("GitLab Observability read failed:", String(error));
      return [];
    }
  };
  const signals = await Promise.all([google.errors(range), fromO11y()]);
  return groupSignals(signals.flat());
};

// The loop's own issues carry its marker; it files them with GITLAB_TOKEN.
export const fromLoop = (issue: Issue) =>
  (issue.description ?? "").includes(marker("issue"));

// When the loop's user last assigned the issue to Duo (newest note first).
export const assignedAt = (notes: Note[], loopUser: string) =>
  notes.find(
    (n) => n.author.username === loopUser && n.body.includes(marker("assigned"))
  )?.created_at;

const scoutIssues = async (gitlab: GitLab) =>
  await gitlab.issues({
    labels: "scout",
    state: "all",
    updated_after: new Date(Date.now() - 14 * 24 * HOUR).toISOString(),
  });

// Assigning the Developer service account is what starts the flow: GitLab
// runs the "assign" trigger for a human's assignment (the token's owner).
// The marker note records the assignment, so the shepherd can tell that the
// Duo session behind an MR started from it.
type Filer = Pick<
  GitLab,
  "createIssue" | "noteOnIssue" | "updateIssue" | "userId"
>;

export const handToDuo = async (gitlab: Filer, issue: number) => {
  const id = await gitlab.userId(DEVELOPER);
  await gitlab.noteOnIssue(
    issue,
    `Assigned to Duo's Developer flow by the wovain loop.\n\n${marker("assigned")}`
  );
  await gitlab.updateIssue(issue, { assignee_ids: [] });
  await gitlab.updateIssue(issue, { assignee_ids: [id] });
};

const statusOf = (forHuman: string[], withDuo: boolean) => {
  if (forHuman.length > 0) {
    return "status::intent";
  }
  return withDuo ? "status::doing" : "status::todo";
};

export const fileProblem = async (
  gitlab: Filer,
  problem: Problem,
  range: Range,
  active: number
) => {
  const forHuman = humanReasons(problem);
  const withDuo = forHuman.length === 0 && active < MAX_ACTIVE;
  const status = statusOf(forHuman, withDuo);
  const issue = await gitlab.createIssue({
    description: issueBody(problem, range, forHuman),
    labels: [
      "scout",
      "type::bug",
      "stage::monitor",
      status,
      ...(withDuo ? ["agent::duo"] : []),
    ].join(","),
    title: titleOf(problem),
  });
  if (withDuo) {
    await handToDuo(gitlab, issue.iid);
  }
  return issue;
};

export const scout = async (sources: Sources, now: Date) => {
  const range = {
    end: now,
    start: new Date(now.getTime() - LOOKBACK_HOURS * HOUR),
  };
  const seen = await problemsIn(sources, range);
  const problems = seen.filter((p) => p.count >= MIN_COUNT);
  const known = await scoutIssues(sources.gitlab);
  // A verified fix that breaks again is a new problem.
  const byFingerprint = new Map(
    known.flatMap((issue) =>
      issue.labels.includes("verified")
        ? []
        : [[fingerprintIn(issue.description), issue] as const]
    )
  );
  const active = known.filter(
    (i) => i.state === "opened" && i.labels.includes("agent::duo")
  ).length;
  const fresh = problems.find((p) => !byFingerprint.has(p.fingerprint));
  const filed =
    fresh === undefined
      ? undefined
      : await fileProblem(sources.gitlab, fresh, range, active);
  return { filed, problems };
};

const countIn = async (
  sources: Sources,
  fingerprint: string,
  range: Range
): Promise<Window> => {
  const [problems, requests] = await Promise.all([
    problemsIn(sources, range),
    sources.google.sum(REQUESTS, range),
  ]);
  const errors =
    problems.find((p) => p.fingerprint === fingerprint)?.count ?? 0;
  return { errors, requests };
};

const regress = async (gitlab: GitLab, issue: Issue, note: string) => {
  const notes = await gitlab.issueNotes(issue.iid);
  // Duo's first try plus each retry; this regression counts too.
  const tries =
    notes.filter((n) => n.body.includes(marker("regressed"))).length + 1;
  // Only an issue the scout gave Duo goes back to Duo.
  const retry = tries < MAX_ATTEMPTS && issue.labels.includes("agent::duo");
  await gitlab.noteOnIssue(issue.iid, note);
  await gitlab.updateIssue(issue.iid, {
    state_event: "reopen",
    ...(retry
      ? {}
      : {
          add_labels: "status::todo",
          remove_labels: "status::doing,agent::duo",
        }),
  });
  if (retry) {
    await handToDuo(gitlab, issue.iid);
  }
};

// One scout issue whose fix merged: compare the problem's errors per request
// in the 24 hours before the merge with the time since.
const verifyOne = async (sources: Sources, issue: Issue, now: Date) => {
  const fingerprint = fingerprintIn(issue.description);
  const related = await sources.gitlab.relatedMergeRequests(issue.iid);
  const [merged] = related
    .flatMap((mr) =>
      typeof mr.merged_at === "string" ? [new Date(mr.merged_at)] : []
    )
    .toSorted((a, b) => b.getTime() - a.getTime());
  if (fingerprint === undefined || merged === undefined) {
    return "wait";
  }
  // After a regression, only a newer merge is a new fix to check.
  const notes = await sources.gitlab.issueNotes(issue.iid);
  const lastVerdict = notes.find((n) => n.body.includes(marker("regressed")));
  if (lastVerdict !== undefined && new Date(lastVerdict.created_at) > merged) {
    return "wait";
  }
  const [before, after] = await Promise.all([
    countIn(sources, fingerprint, {
      end: merged,
      start: new Date(merged.getTime() - 24 * HOUR),
    }),
    countIn(sources, fingerprint, { end: now, start: merged }),
  ]);
  const verdict = decideVerification({
    after,
    before,
    hoursSinceDeploy: (now.getTime() - merged.getTime()) / HOUR,
  });
  if (verdict === "verified") {
    await sources.gitlab.noteOnIssue(
      issue.iid,
      verdictNote(verdict, before, after)
    );
    await sources.gitlab.updateIssue(issue.iid, {
      add_labels: "verified",
      remove_labels: "status::doing,status::review,status::test",
      state_event: "close",
    });
  } else if (verdict === "regressed") {
    await regress(sources.gitlab, issue, verdictNote(verdict, before, after));
  }
  return verdict;
};

export const verify = async (sources: Sources, now: Date) => {
  const known = await scoutIssues(sources.gitlab);
  const issues = known.filter((issue) => !issue.labels.includes("verified"));
  const verdicts = await Promise.allSettled(
    issues.map(async (issue) => await verifyOne(sources, issue, now))
  );
  return Object.fromEntries(
    issues.map((issue, i) => {
      const v = verdicts[i];
      return [
        issue.iid,
        v?.status === "fulfilled" ? v.value : `failed: ${String(v?.reason)}`,
      ];
    })
  );
};
