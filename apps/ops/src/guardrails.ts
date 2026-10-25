import type { Discussion } from "./gitlab.ts";

// What a Duo merge request must pass before the ops job sets GitLab's
// auto-merge. GitLab still waits for the green pipeline (heal:verify
// included); these are the limits on top. Anything else waits for a person.

// Low-risk application code and its tests.
const ALLOWED: RegExp[] = [
  /^apps\/web\/src\//u,
  /^apps\/web\/test\//u,
  /^packages\/api\/src\/routers\//u,
];
// Inside those trees: sign-in, request logging and the fault-injection
// harness, environment, entry points and config.
const DENIED: RegExp[] = [
  /^apps\/web\/src\/app\/api\/auth\//u,
  /^apps\/web\/src\/lib\/(?:evlog[^/]*|auth-client|feature-flags)\.ts$/u,
  /^apps\/web\/src\/lib\/checkout\/catalog\.ts$/u,
  /^apps\/web\/src\/(?:env[^/]*|services|proxy|context)\.ts$/u,
  /(?:^|\/)\.[^/]+/u,
  /\.config\.[cm]?[jt]sx?$/u,
  /(?:^|\/)(?:package|tsconfig[^/]*)\.json$/u,
  /\.(?:ya?ml|json|lock|sh|schema)$/u,
];

export const autoMergeable = (path: string) =>
  ALLOWED.some((re) => re.test(path)) && !DENIED.some((re) => re.test(path));

const MAX_FILES = 10;
const MAX_LINES = 200;
// Pipeline states auto-merge may wait on.
const PIPELINE_OK = new Set(["created", "pending", "running", "success"]);
// Duo submitted its review; "unreviewed" means it's still running.
const REVIEW_DONE = new Set(["reviewed", "approved", "requested_changes"]);

export interface Candidate {
  // Changed paths, old and new.
  paths: string[];
  lines: number;
  draft: boolean;
  hasConflicts: boolean;
  pipeline: string | undefined;
  sha: string;
  reviewedSha: string | undefined;
  reviewerState: string | undefined;
  unresolved: number;
  outsiders: string[];
}

// Checks that don't need a review, so no review is spent on an MR that can't
// be auto-merged anyway.
export const scopeBlockers = (c: Pick<Candidate, "paths" | "lines">) => {
  const reasons: string[] = [];
  const unique = [...new Set(c.paths)];
  const outside = unique.filter((p) => !autoMergeable(p));
  if (outside.length > 0) {
    reasons.push(`touches paths only a person merges: ${outside.join(", ")}`);
  }
  if (unique.length > MAX_FILES) {
    reasons.push(`changes more than ${MAX_FILES} files`);
  }
  if (c.lines > MAX_LINES) {
    reasons.push(`changes ${c.lines} lines (limit ${MAX_LINES})`);
  }
  return reasons;
};

export const reviewDone = (state: string | undefined) =>
  state !== undefined && REVIEW_DONE.has(state);

export const blockers = (c: Candidate): string[] => {
  const reasons = scopeBlockers(c);
  if (c.draft) {
    reasons.push("is a draft");
  }
  if (c.hasConflicts) {
    reasons.push("has merge conflicts");
  }
  if (c.pipeline === undefined || !PIPELINE_OK.has(c.pipeline)) {
    reasons.push(`pipeline ${c.pipeline ?? "missing"}`);
  }
  if (c.reviewedSha !== c.sha || !reviewDone(c.reviewerState)) {
    reasons.push("Duo Code Review hasn't reviewed the head commit");
  }
  if (c.unresolved > 0) {
    reasons.push(`${c.unresolved} unresolved Duo review thread(s)`);
  }
  if (c.outsiders.length > 0) {
    reasons.push(`notes from outside the loop: ${c.outsiders.join(", ")}`);
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

// The reviewer's discussions with an open resolvable note.
export const openThreads = (discussions: Discussion[], reviewer: string) =>
  discussions.filter(
    (d) =>
      d.notes[0]?.author.username === reviewer &&
      d.notes.some((n) => n.resolvable && !n.resolved)
  ).length;

export const outsidersOf = (discussions: Discussion[], allowed: string[]) => {
  const known = new Set(allowed);
  return [
    ...new Set(
      discussions.flatMap((d) =>
        d.notes.flatMap((n) =>
          n.system || known.has(n.author.username) ? [] : [n.author.username]
        )
      )
    ),
  ];
};

const newestFirst = <T extends { createdAt: string }>(items: T[]) =>
  items.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

// The commit the reviewer's latest note covered: a diff note names it; a
// general note maps to the MR version current when it was written.
export const reviewedShaOf = (
  notes: { author: string; createdAt: string; headSha: string | undefined }[],
  versions: { createdAt: string; headSha: string }[],
  reviewer: string
): string | undefined => {
  const [latest] = newestFirst(notes.filter((n) => n.author === reviewer));
  if (latest === undefined) {
    return undefined;
  }
  if (latest.headSha !== undefined) {
    return latest.headSha;
  }
  const [current] = newestFirst(
    versions.filter(
      (v) => Date.parse(v.createdAt) <= Date.parse(latest.createdAt)
    )
  );
  return current?.headSha;
};
