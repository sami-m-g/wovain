import { CODE_JOBS, classify, decideFix, fingerprintOf } from "./gates.ts";
import type { Failure, FixDecision } from "./gates.ts";
import type { CiApi, JobAttempt, TestReport } from "./gitlab-ci.ts";
import type { GitLab, Issue } from "./gitlab.ts";
import { marker } from "./report.ts";

// Red main: decides, once an hour in the loop job, whether a failed main
// pipeline is worth a Duo Fix CI/CD run, and starts it through the API when
// it is (gates.ts has the rules). It replaces the pipeline_hooks trigger,
// which fired on every red push, infra 403s included. Each failure gets one
// tracking issue labeled red-main, keyed by its fingerprint: the issue is
// the dedupe record, and a human's to-do when Duo can't help.

const FIXER = "duo-fix-ci-cd-pipeline-gitlab-ai-hackathon";
const FIX_FLOW = "fix_pipeline/v1";
const LABEL = "red-main";
const ACTIVE = new Set([
  "created",
  "pending",
  "preparing",
  "running",
  "scheduled",
  "waiting_for_resource",
]);
const DONE = new Set(["failed", "success"]);
const ENDED_SESSION = new Set(["CANCELED", "FAILED", "FINISHED", "STOPPED"]);
const FAILED_TEST = new Set(["error", "failed"]);
const MAX_TESTS_LISTED = 10;

export type RedMainGitLab = CiApi &
  Pick<
    GitLab,
    | "createIssue"
    | "issues"
    | "mergeRequests"
    | "noteOnIssue"
    | "pipelines"
    | "sessions"
    | "updateIssue"
  >;

interface JobFailure extends Failure {
  jobId: number;
  tests: string[];
}

const fingerprintIn = (text: string | null) =>
  /Fingerprint: `(?<fp>rm-[0-9a-f]{10})`/u.exec(text ?? "")?.groups?.["fp"];

// The failed tests GitLab parsed from a job's JUnit report: file (or class)
// and test name, which the repository's own test files define.
const failedTests = (report: TestReport, job: string) =>
  report.test_suites.flatMap((suite) =>
    suite.name === job
      ? suite.test_cases.flatMap((c) =>
          FAILED_TEST.has(c.status)
            ? [`${c.file ?? c.classname ?? ""} › ${c.name}`]
            : []
        )
      : []
  );

// Each job's attempts, newest first.
const attemptsByJob = (jobs: JobAttempt[]) => {
  const byName = new Map<string, JobAttempt[]>();
  for (const job of jobs.toSorted((a, b) => b.id - a.id)) {
    byName.set(job.name, [...(byName.get(job.name) ?? []), job]);
  }
  return byName;
};

const failureOf = async (
  gitlab: RedMainGitLab,
  report: TestReport,
  last: JobAttempt,
  attempts: JobAttempt[]
): Promise<JobFailure> => {
  // The log is read only for code jobs, and only to match fixed patterns.
  const logTail = CODE_JOBS.has(last.name)
    ? await gitlab.jobLogTail(last.id).catch(() => "")
    : "";
  const failureClass = classify({
    failureReason: last.failure_reason ?? undefined,
    logTail,
    name: last.name,
  });
  const tests = failedTests(report, last.name);
  return {
    duoStarted: false,
    failureClass,
    fingerprint: fingerprintOf(last.name, failureClass, tests),
    job: last.name,
    jobId: last.id,
    // A retry that failed again confirms the failure.
    persisted:
      attempts.length > 1 && attempts.every((a) => a.status === "failed"),
    retried: attempts.length > 1,
    tests,
  };
};

// The jobs that failed a pipeline (their latest attempt failed and isn't
// allowed to), classified and fingerprinted.
const failuresIn = async (gitlab: RedMainGitLab, pipeline: number) => {
  const [jobs, report] = await Promise.all([
    gitlab.jobAttempts(pipeline),
    gitlab.testReport(pipeline).catch(() => ({ test_suites: [] })),
  ]);
  const failed = [...attemptsByJob(jobs).values()].flatMap((attempts) => {
    const [last] = attempts;
    return last?.status === "failed" && !last.allow_failure
      ? [{ attempts, last }]
      : [];
  });
  return await Promise.all(
    failed.map(
      async ({ attempts, last }) =>
        await failureOf(gitlab, report, last, attempts)
    )
  );
};

const issueBody = (failure: JobFailure, pipelineUrl: string) => {
  const tests =
    failure.tests.length === 0
      ? "none in the JUnit report (lint, types, build or a job without tests)"
      : failure.tests
          .slice(0, MAX_TESTS_LISTED)
          .map((t) => `\`${t}\``)
          .join(", ");
  const next =
    failure.failureClass === "code"
      ? "A code failure in an allowlisted job. The wovain loop starts Duo's Fix CI/CD flow for it once it fails twice (a retry or the next main pipeline), when no other Duo fix is open or running, and within its rate limits (apps/ops/src/gates.ts)."
      : "Not a failure a code change can fix (a job outside the allowlist, or an auth, quota, network or runner error), so the wovain loop doesn't start Duo for it. It needs a human.";
  return `## Problem

The \`${failure.job}\` job failed on main in ${pipelineUrl}.

- Failure class: \`${failure.failureClass}\`
- Failed tests: ${tests}
- Fingerprint: \`${failure.fingerprint}\`

${next}

The loop closes this issue when main passes again.

${marker("red-main")}`;
};

const closeAll = async (
  gitlab: RedMainGitLab,
  open: Issue[],
  pipelineUrl: string
) => {
  await Promise.all(
    open.map(async (issue) => {
      await gitlab.noteOnIssue(
        issue.iid,
        `Main passed again in ${pipelineUrl}.\n\n${marker("red-main-green")}`
      );
      await gitlab.updateIssue(issue.iid, {
        remove_labels: "status::todo,status::doing,status::intent",
        state_event: "close",
      });
    })
  );
  return open.length === 0
    ? "main is green"
    : `main is green: closed ${open.map((i) => `#${i.iid}`).join(", ")}`;
};

// One issue per fingerprint: a human's failure right away, a code failure
// once it's confirmed.
const track = async (
  gitlab: RedMainGitLab,
  failures: JobFailure[],
  open: Map<string, Issue>,
  pipelineUrl: string
) => {
  const toFile = failures.filter(
    (f) =>
      !open.has(f.fingerprint) && (f.failureClass !== "code" || f.persisted)
  );
  const filed = await Promise.all(
    toFile.map(
      async (f) =>
        [
          f.fingerprint,
          await gitlab.createIssue({
            description: issueBody(f, pipelineUrl),
            labels: [
              LABEL,
              "type::bug",
              f.failureClass === "code" ? "status::todo" : "status::intent",
            ].join(","),
            title: `red main: ${f.job} failed (${f.failureClass})`,
          }),
        ] as const
    )
  );
  return new Map([...open, ...filed]);
};

const startFix = async (
  gitlab: RedMainGitLab,
  pipelineUrl: string,
  fingerprints: string[],
  tracked: Map<string, Issue>
) => {
  const session = await gitlab.startFlow(FIX_FLOW, pipelineUrl, "fix_pipeline");
  const issues = fingerprints.flatMap((fp) => {
    const issue = tracked.get(fp);
    return issue === undefined ? [] : [issue];
  });
  await Promise.all(
    issues.map(async (issue) => {
      await gitlab.noteOnIssue(
        issue.iid,
        `Started Duo's Fix CI/CD flow (session ${session.id}) for ${pipelineUrl}: the failure is in code, it failed twice, and no other Duo fix is open or running.\n\n${marker("fix-started")}`
      );
      await gitlab.updateIssue(issue.iid, {
        add_labels: "agent::duo,status::doing",
        remove_labels: "status::todo",
      });
    })
  );
  return session.id;
};

// The gate's inputs besides the failures: open Duo fix MRs and sessions.
const fixContext = async (gitlab: RedMainGitLab) => {
  const [fixMergeRequests, sessions] = await Promise.all([
    gitlab.mergeRequests({ author_username: FIXER, state: "opened" }),
    gitlab.sessions(),
  ]);
  const fixSessions = sessions.filter((s) => s.definition === FIX_FLOW);
  return {
    activeFixSessions: fixSessions.filter((s) => !ENDED_SESSION.has(s.status))
      .length,
    fixSessionStarts: fixSessions.map((s) => new Date(s.createdAt)),
    openFixMergeRequests: fixMergeRequests.map((mr) => mr.iid),
  };
};

// Marks failures that also failed the previous completed main pipeline as
// persisted, and those whose issue says Duo already ran as started.
const annotate = async (
  gitlab: RedMainGitLab,
  failures: JobFailure[],
  previous: { id: number; status: string } | undefined,
  open: Map<string, Issue>
) => {
  const needPrevious =
    previous?.status === "failed" &&
    failures.some((f) => f.failureClass === "code" && !f.persisted);
  const earlier = needPrevious ? await failuresIn(gitlab, previous.id) : [];
  const before = new Set(earlier.map((f) => f.fingerprint));
  for (const f of failures) {
    f.persisted ||= before.has(f.fingerprint);
    f.duoStarted =
      open.get(f.fingerprint)?.labels.includes("agent::duo") ?? false;
  }
};

const act = async (
  gitlab: RedMainGitLab,
  decision: FixDecision,
  failures: JobFailure[]
) => {
  if (decision.action !== "retry") {
    return;
  }
  const jobs = new Set(decision.jobs);
  await Promise.all(
    failures.flatMap((f) => (jobs.has(f.job) ? [gitlab.retryJob(f.jobId)] : []))
  );
};

// What the loop does about main's latest pipeline, as a line for its report.
export const redMain = async (gitlab: RedMainGitLab, now: Date) => {
  const [pipelines, openIssues] = await Promise.all([
    gitlab.pipelines({ ref: "main", source: "push" }),
    gitlab.issues({ labels: LABEL, state: "opened" }),
  ]);
  // Canceled and skipped pipelines say nothing about the code.
  const relevant = pipelines.filter(
    (p) => ACTIVE.has(p.status) || DONE.has(p.status)
  );
  const [latest] = relevant;
  if (latest === undefined) {
    return "no main pipeline";
  }
  if (ACTIVE.has(latest.status)) {
    return `waiting for pipeline ${latest.id}`;
  }
  const pipelineUrl = latest.web_url ?? `pipeline ${latest.id}`;
  if (latest.status === "success") {
    return await closeAll(gitlab, openIssues, pipelineUrl);
  }
  const open = new Map(
    openIssues.flatMap((issue) => {
      const fp = fingerprintIn(issue.description);
      return fp === undefined ? [] : [[fp, issue] as const];
    })
  );
  const failures = await failuresIn(gitlab, latest.id);
  const previous = relevant.find((p) => p.id < latest.id && DONE.has(p.status));
  await annotate(gitlab, failures, previous, open);
  const decision = decideFix({
    ...(await fixContext(gitlab)),
    failures,
    now,
  });
  if (decision.action === "retry") {
    await act(gitlab, decision, failures);
    return `pipeline ${latest.id}: retried ${decision.jobs.join(", ")} once to rule out a flake`;
  }
  if (decision.action === "none") {
    await track(gitlab, failures, open, pipelineUrl);
    return `pipeline ${latest.id}: no Duo (${decision.reason})`;
  }
  const session = await startFix(
    gitlab,
    pipelineUrl,
    decision.fingerprints,
    await track(gitlab, failures, open, pipelineUrl)
  );
  return `pipeline ${latest.id}: started Fix CI/CD (session ${session})`;
};
