import type { Issue, LabelEvent, Note } from "./gitlab.ts";

// Flow 3, issue to completion: an issue labelled agent::task goes to Duo's
// Developer flow, which the ops job starts by assigning the issue with a
// person's token (the Developer flow's assign trigger). GitLab triggers can't
// filter on labels, so the checks live here, and only this job assigns:
//   - a trusted person added agent::task, and nobody edited the title or
//     description after that (the flow reads both);
//   - nobody outside the trusted people and Duo commented (it reads those too);
//   - the issue has acceptance criteria to finish against;
//   - at most MAX_TASKS_IN_FLIGHT at once and MAX_TASK_RUNS_PER_DAY a day.

export const TASK_LABEL = "agent::task";
const MAX_TASKS_IN_FLIGHT = 2;
export const MAX_TASK_RUNS_PER_DAY = 5;

const EDIT = /^changed (?:the )?(?:description|title)/iu;
const CRITERIA =
  /^##\s*acceptance criteria\s*$(?<body>[\s\S]*?)(?=^##\s|(?![\s\S]))/imu;

export const hasAcceptanceCriteria = (description: string | null) =>
  (CRITERIA.exec(description ?? "")?.groups?.["body"] ?? "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .split("\n")
    .some((line) => /\w/u.test(line.replace(/^\s*[-*]\s*(?:\[.\])?/u, "")));

// When a trusted person last added the label, or undefined if the latest
// add was by someone else. With no add event (the label came with the issue,
// e.g. the Agent task template's /label), the creation time if a trusted
// person filed it.
const acceptedAt = (
  issue: Pick<Issue, "author" | "created_at">,
  events: LabelEvent[],
  trusted: Set<string>
) => {
  const [latest] = events
    .filter((e) => e.action === "add" && e.label === TASK_LABEL)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (latest !== undefined) {
    return trusted.has(latest.user) ? latest.createdAt : undefined;
  }
  return trusted.has(issue.author.username) ? issue.created_at : undefined;
};

// Why this issue can't go to Duo yet; undefined means it can.
export const taskBlocker = (input: {
  issue: Issue;
  events: LabelEvent[];
  notes: Note[];
  trusted: Set<string>;
  duoAccounts: string[];
}): string | undefined => {
  const { issue, events, notes, trusted } = input;
  const accepted = acceptedAt(issue, events, trusted);
  if (accepted === undefined) {
    return `${TASK_LABEL} wasn't added by a trusted user`;
  }
  const editedAfter = notes.some(
    (n) =>
      n.system &&
      EDIT.test(n.body) &&
      Date.parse(n.created_at) > Date.parse(accepted)
  );
  if (editedAfter) {
    return `edited after ${TASK_LABEL} was added: a trusted user must add it again`;
  }
  const allowed = new Set([...trusted, ...input.duoAccounts]);
  const outsiders = [
    ...new Set(
      notes
        .filter((n) => !n.system && !allowed.has(n.author.username))
        .map((n) => n.author.username)
    ),
  ];
  if (outsiders.length > 0) {
    return `comments from untrusted users: ${outsiders.join(", ")}`;
  }
  if (!hasAcceptanceCriteria(issue.description)) {
    return "no acceptance criteria";
  }
  return undefined;
};

// How many more tasks may start now.
export const taskBudget = (input: {
  inFlight: number;
  sessions: { definition: string; createdAt: string }[];
  now: Date;
}) => {
  const today = input.sessions.filter(
    (s) =>
      s.definition.startsWith("developer/") &&
      input.now.getTime() - Date.parse(s.createdAt) < 86_400_000
  ).length;
  return Math.max(
    0,
    Math.min(
      MAX_TASKS_IN_FLIGHT - input.inFlight,
      MAX_TASK_RUNS_PER_DAY - today
    )
  );
};
