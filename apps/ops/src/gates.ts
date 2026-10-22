import { createHash } from "node:crypto";

// When the loop spends Duo credits on CI: the Fix CI/CD flow for a red main,
// and Duo Code Review for a merge request. Pure functions only, so each
// condition has a test (apps/ops/test/gates.test.ts); red-main.ts and
// shepherd.ts do the GitLab calls. docs/loop.md explains the rules.

// Jobs whose failure is in the repository's code, so a code change can fix
// it. verify runs lint (ultracite), typecheck, knip, arch, dupes and the unit
// tests. Deploy, infra, release, mirror, sci and Renovate fail on
// permissions, quotas and networks, which Duo can't change.
export const CODE_JOBS = new Set([
  "build",
  "e2e",
  "integration",
  "stories",
  "verify",
]);

// Fix CI/CD runs at most this often, counting every fix_pipeline session in
// the project, including ones a person starts from the UI.
export const MAX_FIX_RUNS_PER_DAY = 3;
export const MAX_FIX_RUNS_PER_HOUR = 1;

// The causes in a failed job's log that a code change can't fix. The log is
// only matched against these fixed patterns; its text never leaves the job
// and never reaches Duo or an issue.
const HUMAN_CLASSES: [Exclude<FailureClass, "code" | "runner">, RegExp][] = [
  [
    "auth",
    /PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant|unauthorized_client|could not find default credentials|insufficient authentication scopes|does not have (?:the )?(?:required )?permission|\b(?:401|403|404)\b[^\n]{0,80}\b(?:unauthori[sz]ed|forbidden|permission|denied|credential|token|workload ?identity|service ?account|not found)\b/iu,
  ],
  [
    "quota",
    /RESOURCE_EXHAUSTED|quota (?:exceeded|exhausted)|rate limit(?:ed)? exceeded|\b429\b|insufficient (?:GitLab )?credits|compute minutes/iu,
  ],
  [
    "network",
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|Could not resolve host|TLS handshake timeout|\b(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Time-?out)\b|ERR_PNPM_(?:META_)?FETCH/iu,
  ],
];

// GitLab's failure_reason for a job its script failed; anything else
// (runner_system_failure, stuck_or_timeout_failure, api_failure, ...) is the
// runner's or GitLab's problem.
const SCRIPT_FAILURE = "script_failure";

export type FailureClass = "code" | "auth" | "quota" | "network" | "runner";

export interface FailedJob {
  name: string;
  // GitLab's structured reason (jobs API failure_reason).
  failureReason: string | undefined;
  // The end of the job's log, matched against HUMAN_CLASSES only.
  logTail: string;
}

// Why a failed job is or isn't Duo's: "code" only for an allowlisted job
// whose script failed and whose log shows no auth, quota or network error.
export const classify = (job: FailedJob): FailureClass | "not-code-job" => {
  if (!CODE_JOBS.has(job.name)) {
    return "not-code-job";
  }
  if (job.failureReason !== undefined && job.failureReason !== SCRIPT_FAILURE) {
    return "runner";
  }
  const human = HUMAN_CLASSES.find(([, re]) => re.test(job.logTail));
  return human === undefined ? "code" : human[0];
};

// A failure's identity: the job and the tests that failed in it (JUnit, from
// GitLab's pipeline test report), never log text. A job with no failed test
// (lint, types, build) is identified by its name and class.
export const fingerprintOf = (
  job: string,
  failureClass: string,
  failedTests: string[]
) =>
  `rm-${createHash("sha256")
    .update(
      [job, failureClass, ...[...new Set(failedTests)].toSorted()].join("\n")
    )
    .digest("hex")
    .slice(0, 10)}`;

export interface Failure {
  job: string;
  fingerprint: string;
  failureClass: FailureClass | "not-code-job";
  // The same fingerprint failed the previous main pipeline too, or a retry
  // of this job failed again.
  persisted: boolean;
  // The loop retried this job already in this pipeline.
  retried: boolean;
  // Duo was already started for this fingerprint (its tracking issue says so).
  duoStarted: boolean;
}

export interface FixState {
  failures: Failure[];
  // Open merge requests by the Fix CI/CD service account.
  openFixMergeRequests: number[];
  // fix_pipeline sessions still running, and the start times of all of them.
  activeFixSessions: number;
  fixSessionStarts: Date[];
  now: Date;
}

export type FixDecision =
  | { action: "duo"; fingerprints: string[] }
  | { action: "retry"; jobs: string[] }
  | { action: "none"; reason: string };

const HOUR_MS = 3_600_000;

const isCode = (f: Failure) => f.failureClass === "code";

// Whether to start Fix CI/CD for a red main. Duo runs only when every failed
// job is a code job with a code failure, at least one of them is new to Duo,
// each new one survived a retry or a second pipeline, no Duo fix is already
// running or open, and the rate limits allow it.
export const decideFix = (state: FixState): FixDecision => {
  const { failures } = state;
  if (failures.length === 0) {
    return { action: "none", reason: "no failed jobs" };
  }
  if (!failures.every(isCode)) {
    return {
      action: "none",
      reason: "a failure isn't in code Duo can fix: filed for a human",
    };
  }
  const fresh = failures.filter((f) => !f.duoStarted);
  if (fresh.length === 0) {
    return { action: "none", reason: "Duo already ran for these failures" };
  }
  const unconfirmed = fresh.filter((f) => !f.persisted);
  if (unconfirmed.length > 0) {
    const toRetry = unconfirmed.flatMap((f) => (f.retried ? [] : [f.job]));
    return toRetry.length > 0
      ? { action: "retry", jobs: toRetry }
      : { action: "none", reason: "waiting for the retry to finish" };
  }
  if (state.openFixMergeRequests.length > 0) {
    return {
      action: "none",
      reason: `a Duo fix merge request is open (!${state.openFixMergeRequests.join(", !")})`,
    };
  }
  if (state.activeFixSessions > 0) {
    return { action: "none", reason: "a Fix CI/CD session is running" };
  }
  const since = (ms: number) =>
    state.fixSessionStarts.filter((d) => state.now.getTime() - d.getTime() < ms)
      .length;
  if (since(HOUR_MS) >= MAX_FIX_RUNS_PER_HOUR) {
    return { action: "none", reason: "rate limit: one Fix CI/CD run an hour" };
  }
  if (since(24 * HOUR_MS) >= MAX_FIX_RUNS_PER_DAY) {
    return {
      action: "none",
      reason: `rate limit: ${MAX_FIX_RUNS_PER_DAY} Fix CI/CD runs a day`,
    };
  }
  return { action: "duo", fingerprints: fresh.map((f) => f.fingerprint) };
};

// Paths that hold no application code: a change to only these gets no Duo
// Code Review.
const DOCS = /^docs\/|\.md$|^LICENSE$/u;
const LOCKFILES = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/u;
// Application code: the server, the widgets, the shared schemas, the loop.
const APP_CODE =
  /^(?:apps\/(?:server|widgets|ops)\/(?:src|test)\/|packages\/shared\/src\/)/u;

export interface ReviewCandidate {
  draft: boolean;
  sourceBranch: string;
  paths: string[];
}

// Why Duo Code Review isn't worth its credits on this MR, or undefined when
// it is: it must be ready (not a draft), not Renovate's, and change
// application code.
const REVIEW_SKIPS: [string, (mr: ReviewCandidate) => boolean][] = [
  ["draft", (mr) => mr.draft],
  ["Renovate update", (mr) => mr.sourceBranch.startsWith("renovate/")],
  [
    "docs only",
    (mr) => mr.paths.length > 0 && mr.paths.every((p) => DOCS.test(p)),
  ],
  [
    "lockfile only",
    (mr) => mr.paths.length > 0 && mr.paths.every((p) => LOCKFILES.test(p)),
  ],
  ["no application code", (mr) => !mr.paths.some((p) => APP_CODE.test(p))],
];

export const reviewSkipReason = (mr: ReviewCandidate) =>
  REVIEW_SKIPS.find(([, skip]) => skip(mr))?.[0];
