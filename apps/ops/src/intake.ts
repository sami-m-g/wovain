import type { GitLab, Issue } from "./gitlab.ts";
import { marker } from "./report.ts";
import { DEVELOPER, handToDuo } from "./scout.ts";

// Intake: hands accepted issues (any kind, not only scout bugs) to Duo's
// Developer flow, gated like the red-main fix gate. The loop assigns with
// GITLAB_TOKEN, a person's token, so the assign trigger fires. An issue is
// accepted when the owner (the loop's user) put it in status::todo. Issue
// text is untrusted: it is only ever used to skip an issue (no acceptance
// criteria, or it names a path only a person may change), never to pick or
// to steer Duo.

// One Developer session at a time, and at most this many started a day
// (scout hand-offs included).
const MAX_DEV_IN_FLIGHT = 1;
export const MAX_DEV_SESSIONS_PER_DAY = 4;
const ENDED = new Set(["CANCELED", "FAILED", "FINISHED", "STOPPED"]);
const NO_PRIORITY = 9;

// Issues that would touch what auto-merge never allows go to the owner:
// sign-in, credentials, infra and CI, and anything that spends or launches.
const DENIED =
  /\b(?:auth|oauth|login|sign[- ]?in|tokens?|secrets?|credentials?|cipher|infra|pulumi|\.gitlab|gitlab-ci|ci\/cd|iam|spend|budget|billing|payments?|campaigns?|meta ads?|publish|autopilot|optimizer|launch)\b/iu;

// A heading the templates use for the outcome (Agent task, Feature, Bug),
// with at least one line of real content under it.
const CRITERIA =
  /^##\s*(?:acceptance criteria|done when|expected behavior)\s*$(?<body>[\s\S]*?)(?=^##\s|(?![\s\S]))/imu;

export const hasAcceptanceCriteria = (description: string | null) => {
  const body = CRITERIA.exec(description ?? "")?.groups?.["body"] ?? "";
  return body
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .split("\n")
    .some((line) => /\w/u.test(line.replace(/^\s*[-*]\s*(?:\[.\])?/u, "")));
};

export const deniedReason = (issue: Pick<Issue, "description" | "title">) =>
  DENIED.exec(`${issue.title}\n${issue.description ?? ""}`)?.[0];

export interface LabelEvent {
  action: string;
  label: string | undefined;
  user: string;
  createdAt: string;
}

// The latest time status::todo was added, the owner added it. With no event
// (labels set at creation), the author counts.
export const acceptedBy = (
  issue: Pick<Issue, "author">,
  events: LabelEvent[],
  loopUser: string
) => {
  const [latest] = events
    .filter((e) => e.action === "add" && e.label === "status::todo")
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (latest?.user ?? issue.author.username) === loopUser;
};

const priorityOf = (labels: string[]) => {
  const label = labels.find((l) => /^priority::\d$/u.test(l));
  return label === undefined ? NO_PRIORITY : Number(label.slice(-1));
};

// Open, accepted-looking todo issues nobody has: not an intent, unassigned,
// and not the owner's own Claude work.
export const queued = (issues: Issue[]) =>
  issues
    .filter(
      (i) =>
        i.state === "opened" &&
        i.labels.includes("status::todo") &&
        !i.labels.includes("status::intent") &&
        !i.labels.includes("agent::claude") &&
        i.assignees.length === 0
    )
    .toSorted(
      (a, b) => priorityOf(a.labels) - priorityOf(b.labels) || a.iid - b.iid
    );

interface Session {
  definition: string;
  status: string;
  createdAt: string;
}

// The gate: no Developer session running, and the day's cap not reached.
export const devGate = (sessions: Session[], now: Date) => {
  const dev = sessions.filter((s) => s.definition.startsWith("developer/"));
  const running = dev.filter((s) => !ENDED.has(s.status.toUpperCase()));
  if (running.length >= MAX_DEV_IN_FLIGHT) {
    return "a Developer session is running";
  }
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const today = dev.filter((s) => Date.parse(s.createdAt) >= midnight);
  return today.length >= MAX_DEV_SESSIONS_PER_DAY
    ? `daily cap reached (${today.length} of ${MAX_DEV_SESSIONS_PER_DAY})`
    : undefined;
};

type IntakeGitLab = Pick<
  GitLab,
  | "createIssue"
  | "issueNotes"
  | "issues"
  | "labelEvents"
  | "noteOnIssue"
  | "sessions"
  | "updateIssue"
  | "userId"
>;

// Says why an issue waits, once per kind.
const noteOnce = async (
  gitlab: IntakeGitLab,
  iid: number,
  kind: string,
  body: string
) => {
  const notes = await gitlab.issueNotes(iid);
  if (!notes.some((n) => n.body.includes(marker(kind)))) {
    await gitlab.noteOnIssue(iid, `${body}\n\n${marker(kind)}`);
  }
};

// One hand-off a run at most. Returns what happened, for the report.
export const intake = async (
  gitlab: IntakeGitLab,
  context: { loopUser: string; now: Date }
): Promise<string> => {
  const blocked = devGate(await gitlab.sessions(), context.now);
  if (blocked !== undefined) {
    return `waiting: ${blocked}`;
  }
  const todo = queued(
    await gitlab.issues({ labels: "status::todo", state: "opened" })
  );
  for (const issue of todo) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one issue at a time, stop at the first hand-off
    const events = await gitlab.labelEvents(issue.iid);
    if (!acceptedBy(issue, events, context.loopUser)) {
      continue;
    }
    const denied = deniedReason(issue);
    if (denied !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
      const ownerId = await gitlab.userId(context.loopUser);
      // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
      await gitlab.noteOnIssue(
        issue.iid,
        `The wovain loop didn't give this to Duo: it mentions "${denied}", which only a person changes. Assigned to the owner.\n\n${marker("needs-owner")}`
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
      await gitlab.updateIssue(issue.iid, { assignee_ids: [ownerId] });
      continue;
    }
    if (!hasAcceptanceCriteria(issue.description)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- same issue
      await noteOnce(
        gitlab,
        issue.iid,
        "needs-criteria",
        "The wovain loop will give this to Duo's Developer flow once it has acceptance criteria (an `## Acceptance criteria` section with at least one item)."
      );
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- the one hand-off
    await gitlab.updateIssue(issue.iid, {
      add_labels: "agent::duo,status::doing",
      remove_labels: "status::todo",
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- the one hand-off
    await handToDuo(gitlab, issue.iid);
    return `#${issue.iid} assigned to ${DEVELOPER}`;
  }
  return "nothing to hand off";
};
