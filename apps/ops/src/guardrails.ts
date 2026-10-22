// What a Duo-written merge request must pass before the loop asks GitLab to
// auto-merge it. GitLab still waits for a green pipeline; these are the
// limits on top of that. Anything that fails stays for a human.

// Paths only a human merges: infrastructure, sign-in, CI and Duo config,
// hosting, storage rules, dependency changes and agent instructions.
const PROTECTED: RegExp[] = [
  /^infra\//u,
  /^apps\/server\/src\/auth\//u,
  /^\.gitlab\//u,
  /^\.gitlab-ci\.yml$/u,
  /^\.config\//u,
  /^\.agents\//u,
  /^\.claude\//u,
  /^apphosting\.yaml$/u,
  /^firebase\.json$/u,
  /\.rules$/u,
  /(?:^|\/)package\.json$/u,
  /^pnpm-(?:lock|workspace)\.yaml$/u,
  /^AGENTS\.md$/u,
];

export const MAX_FILES = 10;
export const MAX_LINES = 300;

export interface Candidate {
  // Changed paths, old and new (a rename counts twice).
  paths: string[];
  // Lines added plus removed.
  lines: number;
  draft: boolean;
  hasConflicts: boolean;
  // The pipeline on the head commit, if any.
  pipeline: string | undefined;
  // Duo Code Review has reviewed the head commit.
  reviewed: boolean;
  // Review threads that are still open.
  unresolved: number;
  // The MR closes an issue the scout filed.
  closesScoutIssue: boolean;
}

// Every reason the MR can't be auto-merged yet; empty means go.
export const blockers = (mr: Candidate): string[] => {
  const reasons: string[] = [];
  const touched = mr.paths.filter((p) => PROTECTED.some((re) => re.test(p)));
  if (touched.length > 0) {
    reasons.push(`touches protected paths: ${touched.join(", ")}`);
  }
  if (new Set(mr.paths).size > MAX_FILES) {
    reasons.push(`changes more than ${MAX_FILES} files`);
  }
  if (mr.lines > MAX_LINES) {
    reasons.push(`changes ${mr.lines} lines (limit ${MAX_LINES})`);
  }
  if (!mr.closesScoutIssue) {
    reasons.push("doesn't close a scout issue");
  }
  if (mr.draft) {
    reasons.push("is a draft");
  }
  if (mr.hasConflicts) {
    reasons.push("has merge conflicts");
  }
  if (mr.pipeline === "failed" || mr.pipeline === "canceled") {
    reasons.push(`pipeline ${mr.pipeline}`);
  }
  if (!mr.reviewed) {
    reasons.push("no Duo Code Review on the latest commit yet");
  }
  if (mr.unresolved > 0) {
    reasons.push(`${mr.unresolved} unresolved review thread(s)`);
  }
  return reasons;
};

// Lines added plus removed in a unified diff.
export const diffLines = (diff: string) =>
  diff
    .split("\n")
    .filter(
      (line) =>
        (line.startsWith("+") || line.startsWith("-")) &&
        !line.startsWith("+++") &&
        !line.startsWith("---")
    ).length;
