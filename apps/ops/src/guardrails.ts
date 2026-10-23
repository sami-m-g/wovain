// What a Duo-written merge request must pass before the loop asks GitLab to
// auto-merge it. GitLab still waits for a green pipeline; these are the
// limits on top of that. Anything that fails stays for a human.

// Auto-merge may only touch low-risk application source and its tests: the
// server's helpers and tools, the widgets and the shared schemas. Everything
// else (the loop itself, infra, CI, config, dependencies, agent instructions
// and playbooks, docs, the server's entry points) always needs a human.
const ALLOWED: RegExp[] = [
  /^apps\/server\/src\/(?:lib|tools)\//u,
  /^apps\/server\/test\/(?:unit|integration)\//u,
  /^apps\/widgets\/src\//u,
  /^packages\/shared\/src\//u,
];
// Inside the allowed trees: anything that signs in, holds credentials, spends
// money or launches ads, what the scout reads (request-errors, tool-result),
// network guards, and any config file.
const DENIED: RegExp[] = [
  /^apps\/server\/src\/(?:auth|routes)\//u,
  /^apps\/server\/src\/lib\/(?:launch-approvals|connections|cipher|oauth-client|upstream|approval|request-errors|tool-result|fetch-[^/]+)\.ts$/u,
  /^apps\/server\/src\/lib\/(?:meta|browser|autopilot)-[^/]+$/u,
  /^apps\/server\/src\/lib\/(?:optimizer|autopilot)\//u,
  /^apps\/server\/src\/tools\/(?:meta|connections|campaign|publish|autopilot)\.ts$/u,
  /^packages\/shared\/src\/optimizer\//u,
  /(?:^|\/)\.[^/]+/u,
  /\.config\.[cm]?[jt]sx?$/u,
  /(?:^|\/)tsconfig[^/]*\.json$/u,
  /(?:^|\/)package\.json$/u,
  /\.(?:ya?ml|json|lock|rules|sh)$/u,
];

export const autoMergeable = (path: string) =>
  ALLOWED.some((re) => re.test(path)) && !DENIED.some((re) => re.test(path));

// Every MR the loop shepherds fixes a scout issue, so these are the scout's
// limits.
export const MAX_FILES = 10;
export const MAX_LINES = 100;

export interface Candidate {
  // Changed paths, old and new (a rename counts twice).
  paths: string[];
  // Lines added plus removed.
  lines: number;
  draft: boolean;
  hasConflicts: boolean;
  // The pipeline on the head commit, if any.
  pipeline: string | undefined;
  // The MR's head commit, and the commit Duo Code Review last reviewed.
  sha: string;
  reviewedSha: string | undefined;
  // Duo Code Review's state in the reviewers API.
  reviewerState: string | undefined;
  // Duo Code Review's threads that are still open, from every page.
  unresolved: number;
  // People other than Duo and the loop who wrote on the MR.
  outsiders: string[];
  // Why the MR isn't provably the loop's own work; empty when it is.
  provenance: string[];
}

// Duo submitted its review; "unreviewed" means it's still running.
const DONE = new Set(["reviewed", "approved", "requested_changes"]);
export const reviewDone = (state: string | undefined) =>
  state !== undefined && DONE.has(state);

interface ThreadNote {
  author: { username: string };
  resolvable: boolean;
  resolved: boolean;
  system: boolean;
}

// Duo Code Review's discussions with a resolvable note that isn't resolved.
// Threads anyone else starts never steer the Developer flow; they stop
// auto-merge through outsiders() instead.
export const openThreads = (
  discussions: { notes: ThreadNote[] }[],
  reviewer: string
) =>
  discussions.filter(
    (d) =>
      d.notes[0]?.author.username === reviewer &&
      d.notes.some((n) => n.resolvable && !n.resolved)
  ).length;

// Who wrote a note on the MR besides Duo Code Review, the Developer flow and
// the loop. GitLab's own system notes don't count.
export const outsiders = (
  discussions: { notes: ThreadNote[] }[],
  allowed: string[]
) => {
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

// Every reason the MR can't be auto-merged yet; empty means go.
export const blockers = (mr: Candidate): string[] => {
  const reasons = [...mr.provenance];
  const outside = [...new Set(mr.paths)].filter((p) => !autoMergeable(p));
  if (outside.length > 0) {
    reasons.push(`touches paths only a human merges: ${outside.join(", ")}`);
  }
  if (new Set(mr.paths).size > MAX_FILES) {
    reasons.push(`changes more than ${MAX_FILES} files`);
  }
  if (mr.lines > MAX_LINES) {
    reasons.push(`changes ${mr.lines} lines (limit ${MAX_LINES})`);
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
  if (mr.reviewedSha !== mr.sha || !reviewDone(mr.reviewerState)) {
    reasons.push("Duo Code Review hasn't reviewed the head commit");
  }
  if (mr.unresolved > 0) {
    reasons.push(`${mr.unresolved} unresolved Duo review thread(s)`);
  }
  if (mr.outsiders.length > 0) {
    reasons.push(
      `has notes from outside the loop: ${mr.outsiders.map((u) => `@${u}`).join(", ")}`
    );
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

const newestFirst = <T extends { createdAt: string }>(items: T[]) =>
  items.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

// The commit Duo's latest review covered: a diff note names its head commit;
// a general note is matched to the MR version that was current when it was
// written (GET merge_requests/:iid/versions).
export const reviewedShaOf = (
  notes: {
    author: string;
    createdAt: string;
    headSha: string | undefined;
  }[],
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

export interface Provenance {
  loopUser: string;
  developer: string;
  issue: {
    iid: number;
    author: string;
    labels: string[];
    assignees: string[];
    // The loop's own marker in the description.
    fromLoop: boolean;
    // The owner put it in status::todo (intake.ts), so the loop may hand it
    // to Duo though someone else filed it.
    accepted: boolean;
    // When the loop last assigned it to Duo (its marker note), if ever.
    assignedAt: string | undefined;
  };
  mr: {
    iid: number;
    author: string;
    sourceBranch: string;
    // Issues GitLab says the MR closes (closes_issues API).
    closes: number[];
  };
  // Duo sessions in the project (GraphQL duoWorkflowWorkflows).
  sessions: {
    definition: string;
    sourceType: string;
    user: string;
    issue: number | undefined;
    createdAt: string;
    mergeRequests: number[];
  }[];
}

// Why this MR isn't provably the loop's work: the loop filed (or the owner
// accepted) and the loop assigned the issue, the Developer flow wrote the MR in a session the loop's assignment
// started, and the MR is bound to that issue by GitLab, not by text.
export const provenanceGaps = (p: Provenance): string[] => {
  const gaps: string[] = [];
  const { issue, mr } = p;
  const filedByLoop =
    issue.author === p.loopUser &&
    issue.fromLoop &&
    issue.labels.includes("scout");
  if (
    !(filedByLoop || issue.accepted) ||
    !issue.assignees.includes(p.developer) ||
    issue.assignedAt === undefined
  ) {
    gaps.push(`#${issue.iid} isn't an issue the loop filed and assigned`);
  }
  if (mr.author !== p.developer) {
    gaps.push(`the author isn't ${p.developer}`);
  }
  const branchMatches = new RegExp(`(?:^|\\D)${issue.iid}(?:\\D|$)`, "u").test(
    mr.sourceBranch
  );
  if (!mr.closes.includes(issue.iid) && !branchMatches) {
    gaps.push(`neither closes #${issue.iid} nor comes from its branch`);
  }
  const started = p.sessions.some(
    (s) =>
      s.definition.startsWith("developer/") &&
      s.sourceType === "FLOW_TRIGGER" &&
      s.user === p.loopUser &&
      s.issue === issue.iid &&
      issue.assignedAt !== undefined &&
      Date.parse(s.createdAt) >= Date.parse(issue.assignedAt) &&
      s.mergeRequests.includes(mr.iid)
  );
  if (!started) {
    gaps.push(
      `no Developer session started by the loop's assignment of #${issue.iid}`
    );
  }
  return gaps;
};
