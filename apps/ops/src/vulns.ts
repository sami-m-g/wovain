import type { Issue, Note } from "./gitlab.ts";
import { TASK_LABEL } from "./intake.ts";

// Vuln to fix (docs/flows.md): a new High or Critical SAST finding goes to
// Duo Vulnerability Resolution, which opens a merge request; the shepherd
// then treats it like any Duo MR (Duo Code Review, guardrails, auto-merge).
// Each start is a note on one confidential "vuln-fix" issue, which is both
// the audit trail and the daily cap's count. Only findings GitLab's scanner
// reported are used: their ids, never their text.
//
// When this project can't call Vulnerability Resolution (no Duo AI features
// for the role or tier), the ops job notes that on the same issue, stops
// asking for a week, and instead files one agent::task + vuln-fix issue per
// finding: intake then hands it to the Developer flow like any task.

export const VULN_LABEL = "vuln-fix";
export const MAX_VULN_FIXES_PER_DAY = 2;
// Older findings were there before the flow; a person triages those.
const NEW_WITHIN_MS = 14 * 86_400_000;
const DAY_MS = 86_400_000;
const STARTED =
  /<!-- wovain:vuln:(?<id>gid:\/\/gitlab\/Vulnerability\/\d+) -->/u;

export const startedMarker = (id: string) => `<!-- wovain:vuln:${id} -->`;

// The findings the ops job already handed to Duo, with when.
export const startedVulns = (notes: Note[]) =>
  new Map(
    notes.flatMap((n) => {
      const id = STARTED.exec(n.body)?.groups?.["id"];
      return id === undefined ? [] : [[id, n.created_at] as const];
    })
  );

export interface Vulnerability {
  id: string;
  detectedAt: string;
  mergeRequest: number | undefined;
  severity: string;
}

// The findings to hand to Duo now, within the daily cap.
export const pickVulns = <T extends Vulnerability>(
  vulns: T[],
  started: Map<string, string>,
  now: Date
) => {
  const today = [...started.values()].filter(
    (at) => now.getTime() - Date.parse(at) < DAY_MS
  ).length;
  const budget = Math.max(0, MAX_VULN_FIXES_PER_DAY - today);
  return vulns
    .filter(
      (v) =>
        !started.has(v.id) &&
        v.mergeRequest === undefined &&
        now.getTime() - Date.parse(v.detectedAt) < NEW_WITHIN_MS
    )
    .slice(0, budget);
};

// Merge requests GitLab links to findings the ops job handed to Duo.
export const vulnMergeRequests = (
  vulns: Vulnerability[],
  started: Map<string, string>
) =>
  vulns.flatMap((v) =>
    started.has(v.id) && v.mergeRequest !== undefined ? [v.mergeRequest] : []
  );

export const MAX_OPEN_VULN_TASKS = 3;
// A closed task whose finding the default-branch scan still reports is
// reopened; the scan runs on every main pipeline, so a day is plenty.
const REOPEN_AFTER_MS = DAY_MS;
// How long the ops job trusts "unavailable" before asking Duo again.
const RETRY_RESOLUTION_MS = 7 * DAY_MS;
const UNAVAILABLE_MARKER = "<!-- wovain:vuln-resolution-unavailable -->";
const UNAVAILABLE =
  /AI features are not enabled|not permitted to be sent|not have permission|not authorized/iu;
const TASKED =
  /<!-- wovain:vuln-task:(?<id>gid:\/\/gitlab\/Vulnerability\/\d+) -->/u;
const MAX_TITLE = 200;

// GitLab's answer when the role or tier can't use Vulnerability Resolution.
export const isUnavailable = (message: string) => UNAVAILABLE.test(message);

export const unavailableNote = (message: string) =>
  `Duo Vulnerability Resolution isn't available here (${message}). wovain ops files an agent::task issue per finding instead and asks again in a week.\n\n${UNAVAILABLE_MARKER}`;

// Whether a recent note says Vulnerability Resolution is unavailable.
export const resolutionUnavailable = (notes: Note[], now: Date) =>
  notes.some(
    (n) =>
      n.body.includes(UNAVAILABLE_MARKER) &&
      now.getTime() - Date.parse(n.created_at) < RETRY_RESOLUTION_MS
  );

export interface VulnFinding extends Vulnerability {
  file: string | undefined;
  identifiers: string[];
  line: string | undefined;
  title: string;
  webUrl: string;
}

const taskMarker = (id: string) => `<!-- wovain:vuln-task:${id} -->`;

export const vulnTaskTitle = (v: VulnFinding) => {
  const where = v.file === undefined ? "" : ` in ${v.file}`;
  return `Fix ${v.severity.toLowerCase()} SAST finding: ${v.title}${where}`.slice(
    0,
    MAX_TITLE
  );
};

// The task the Developer flow works from: the scanner's ids and location,
// and the acceptance criteria intake requires.
export const vulnTaskBody = (v: VulnFinding) => {
  const line = v.line === undefined ? "" : `:${v.line}`;
  const where = v.file === undefined ? "the finding" : `\`${v.file}${line}\``;
  const identifiers =
    v.identifiers.length === 0 ? "none" : v.identifiers.join(", ");
  return [
    "Duo Vulnerability Resolution isn't available to this project, so wovain ops hands this SAST finding to the Developer flow (docs/flows.md, flow 4).",
    "",
    `- Finding: ${v.webUrl}`,
    `- Severity: ${v.severity}`,
    `- Rule: ${v.title}`,
    `- Identifiers: ${identifiers}`,
    `- Location: ${where}`,
    "",
    "## Acceptance criteria",
    "",
    `- [ ] The code at ${where} no longer has the weakness the rule names, fixed in code with the smallest change.`,
    "- [ ] A test covers the fix where that code has tests.",
    "- [ ] If the finding is a false positive, nothing is suppressed: a comment on this issue says why, and a person decides.",
    "- [ ] `pnpm run check`, `pnpm run check-types`, `pnpm run knip` and `pnpm run test` pass.",
    "",
    taskMarker(v.id),
  ].join("\n");
};

// The task issues already filed, by finding id.
export const taskedVulns = (issues: Issue[]) =>
  new Map(
    issues.flatMap((i) => {
      const id = TASKED.exec(i.description ?? "")?.groups?.["id"];
      return id === undefined || !i.labels.includes(TASK_LABEL)
        ? []
        : [[id, i] as const];
    })
  );

// Which findings get a new task issue and which closed ones reopen: one
// issue per finding, at most MAX_OPEN_VULN_TASKS open at once.
export const planVulnTasks = <T extends VulnFinding>(input: {
  vulns: T[];
  tasks: Issue[];
  now: Date;
}) => {
  const tasked = taskedVulns(input.tasks);
  const open = [...tasked.values()].filter((i) => i.state === "opened").length;
  let budget = Math.max(0, MAX_OPEN_VULN_TASKS - open);
  const create: T[] = [];
  const reopen: { issue: Issue; vuln: T }[] = [];
  for (const vuln of input.vulns) {
    if (budget === 0) {
      break;
    }
    const issue = tasked.get(vuln.id);
    const stale =
      issue?.state === "closed" &&
      input.now.getTime() - Date.parse(issue.closed_at ?? issue.created_at) >
        REOPEN_AFTER_MS;
    if (vuln.mergeRequest !== undefined) {
      continue;
    }
    if (issue === undefined) {
      create.push(vuln);
      budget -= 1;
    } else if (stale) {
      reopen.push({ issue, vuln });
      budget -= 1;
    }
  }
  return { create, open, reopen };
};

// Auto-resolve: findings the latest default-branch scan no longer reports
// are set to Resolved, a few per run, each logged on the vuln-fix issue. The
// vulnerability management policy (security-policies/policy.yml) does the
// same where Ultimate and a linked policy project allow it.
export const MAX_AUTO_RESOLVE_PER_RUN = 10;
export const RESOLVE_COMMENT =
  "No longer detected on the default branch: resolved by wovain ops.";

export interface GoneFinding {
  id: string;
  resolvedOnDefaultBranch: boolean;
  severity: string;
  webUrl: string;
}

// The findings to resolve now: only ones GitLab says are gone, within the cap.
export const pickGone = <T extends GoneFinding>(vulns: T[]) =>
  vulns
    .filter((v) => v.resolvedOnDefaultBranch)
    .slice(0, MAX_AUTO_RESOLVE_PER_RUN);

export const resolvedNote = (v: GoneFinding) =>
  `Resolved a ${v.severity} finding the default-branch scan no longer reports: ${v.webUrl}\n\n<!-- wovain:vuln-resolved:${v.id} -->`;
