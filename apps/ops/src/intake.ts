import { createHash } from "node:crypto";

import type { GitLab, Issue, Note } from "./gitlab.ts";
import { marker } from "./report.ts";
import { DEVELOPER, handToDuo } from "./scout.ts";

// Intake: hands accepted issues (any kind, not only scout bugs) to Duo's
// Developer flow, gated like the red-main fix gate. The loop assigns with
// GITLAB_TOKEN, a person's token, so the assign trigger fires. An issue is
// accepted when the owner (the loop's user) put it in status::todo.
//
// Duo never works the original. Anyone with access can edit or comment on
// it, so the loop copies the accepted title and description into a new
// issue it files itself, locks that copy's discussion and assigns only the
// copy. The shepherd checks that the copy still matches the hash recorded
// here and that no one outside the loop and Duo wrote on it. An original
// edited after it was accepted goes back to status::intent. Issue text is
// otherwise only used to skip an issue (no acceptance criteria, or it names
// something only a person may change), never to pick one.

// One Developer session at a time, and at most this many started a day
// (scout hand-offs included).
const MAX_DEV_IN_FLIGHT = 1;
export const MAX_DEV_SESSIONS_PER_DAY = 4;
const ENDED = new Set(["CANCELED", "FAILED", "FINISHED", "STOPPED"]);
const NO_PRIORITY = 9;
// Labels the copy keeps from the original.
const KEPT = /^(?:type|priority|stage)::/u;

// Issues that would touch what auto-merge never allows go to the owner:
// sign-in, credentials, infra and CI, and anything that spends or launches.
const DENIED =
  /\b(?:auth|oauth|login|sign[- ]?in|tokens?|secrets?|credentials?|cipher|infra|pulumi|\.gitlab|gitlab-ci|ci\/cd|iam|spend|budget|billing|payments?|campaigns?|meta ads?|publish|autopilot|optimizer|launch)\b/iu;

// A heading the templates use for the outcome (Agent task, Feature, Bug),
// with at least one line of real content under it.
const CRITERIA =
  /^##\s*(?:acceptance criteria|done when|expected behavior)\s*$(?<body>[\s\S]*?)(?=^##\s|(?![\s\S]))/imu;

// GitLab's system notes for a title or description edit.
const EDIT = /^changed (?:the )?(?:description|title)/iu;
const ACCEPTED =
  /<!-- wovain-loop:accepted:(?<hash>[0-9a-f]{16}):(?<at>\d+) -->/u;

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

// When the owner accepted the issue: the latest time status::todo was added,
// if they added it. With no event (labels set at creation), its creation time
// when they filed it. undefined means it isn't accepted.
export const acceptedAt = (
  issue: Pick<Issue, "author" | "created_at">,
  events: LabelEvent[],
  loopUser: string
) => {
  const [latest] = events
    .filter((e) => e.action === "add" && e.label === "status::todo")
    .toSorted((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  if (latest !== undefined) {
    return latest.user === loopUser ? latest.createdAt : undefined;
  }
  return issue.author.username === loopUser ? issue.created_at : undefined;
};

// The last edit of the title or description (system notes, newest first).
const lastEdit = (notes: Note[]) =>
  notes.find((n) => n.system && EDIT.test(n.body))?.created_at;

export const contentHash = (issue: Pick<Issue, "description" | "title">) =>
  createHash("sha256")
    .update(`${issue.title}\n${issue.description ?? ""}`)
    .digest("hex")
    .slice(0, 16);

// The copy's recorded hash and the original's acceptance time (ms), from the
// loop's own note.
const recordedAcceptance = (notes: Note[], loopUserId: number) => {
  const [groups] = notes.flatMap((n) => {
    const found =
      n.author.id === loopUserId ? ACCEPTED.exec(n.body)?.groups : undefined;
    return found === undefined ? [] : [found];
  });
  return groups?.["hash"] === undefined || groups["at"] === undefined
    ? undefined
    : { acceptedAt: Number(groups["at"]), hash: groups["hash"] };
};

// The copy's description is the accepted text plus this marker, which lets
// the shepherd tell the loop's copies from other issues. It never names the
// original: Duo would read that issue too. The loop keeps the mapping on the
// original instead (its "handed" note).
export const COPY_MARKER = marker("copy");
export const isCopy = (issue: Pick<Issue, "description">) =>
  (issue.description ?? "").includes(COPY_MARKER);
const handedMarker = (copy: number) => marker(`handed:${copy}`);

// Who may write on an issue Duo works: the loop's user and the Duo service
// accounts the triggers run as (infra/Pulumi.prod.yaml), by user id.
const DUO_ACCOUNTS = [
  DEVELOPER,
  "duo-code-review-gitlab-ai-hackathon",
  "duo-fix-ci-cd-pipeline-gitlab-ai-hackathon",
];
export interface Trust {
  loopUserId: number;
  ids: Set<number>;
}
export const resolveTrust = async (
  gitlab: Pick<GitLab, "currentUser" | "userId">
): Promise<Trust> => {
  const me = await gitlab.currentUser();
  const duo = await Promise.all(
    DUO_ACCOUNTS.map(async (name) => await gitlab.userId(name))
  );
  return { ids: new Set([me.id, ...duo]), loopUserId: me.id };
};

const priorityOf = (labels: string[]) => {
  const label = labels.find((l) => /^priority::\d$/u.test(l));
  return label === undefined ? NO_PRIORITY : Number(label.slice(-1));
};

// Open todo issues nobody has: not an intent, unassigned, and not the
// owner's own Claude work.
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
  | "allIssueNotes"
  | "issues"
  | "labelEvents"
  | "noteOnIssue"
  | "sessions"
  | "updateIssue"
  | "userId"
>;

const sendBack = async (gitlab: IntakeGitLab, iid: number) => {
  await gitlab.noteOnIssue(
    iid,
    `The wovain loop didn't give this to Duo: its title or description changed after it was accepted. Moved back to status::intent; move it to status::todo again to accept it as it is now.\n\n${marker("edited-after-accept")}`
  );
  await gitlab.updateIssue(iid, {
    add_labels: "status::intent",
    remove_labels: "status::todo",
  });
};

const toOwner = async (
  gitlab: IntakeGitLab,
  iid: number,
  context: { denied: string; loopUser: string }
) => {
  const ownerId = await gitlab.userId(context.loopUser);
  await gitlab.noteOnIssue(
    iid,
    `The wovain loop didn't give this to Duo: it mentions "${context.denied}", which only a person changes. Assigned to the owner.\n\n${marker("needs-owner")}`
  );
  await gitlab.updateIssue(iid, { assignee_ids: [ownerId] });
};

// Files the copy Duo works, records what was accepted, locks it and assigns
// Duo. Locking is best effort. The original gets the mapping.
const handOff = async (gitlab: IntakeGitLab, issue: Issue, since: string) => {
  const copy = await gitlab.createIssue({
    description: `${issue.description ?? ""}\n\n${COPY_MARKER}`,
    labels: [
      ...issue.labels.filter((l) => KEPT.test(l)),
      "agent::duo",
      "status::doing",
    ].join(","),
    title: issue.title,
  });
  const hash = contentHash(copy);
  await gitlab.noteOnIssue(
    copy.iid,
    `Accepted content recorded by the wovain loop (hash \`${hash}\`). An edit, or a note from anyone outside the loop and Duo, stops auto-merge.\n\n${marker(`accepted:${hash}:${Date.parse(since)}`)}`
  );
  await gitlab
    .updateIssue(copy.iid, { discussion_locked: true })
    .catch(() => null);
  await gitlab.noteOnIssue(
    issue.iid,
    `Handed to Duo's Developer flow as #${copy.iid}, a copy of this issue as accepted.\n\n${handedMarker(copy.iid)}`
  );
  await gitlab.updateIssue(issue.iid, {
    add_labels: "agent::duo,status::doing",
    remove_labels: "status::todo",
  });
  await handToDuo(gitlab, copy.iid);
  return `#${issue.iid} handed to ${DEVELOPER} as #${copy.iid}`;
};

// Hands one issue to Duo, or says why not; undefined means try the next.
const considerOne = async (
  gitlab: IntakeGitLab,
  issue: Issue,
  context: { loopUser: string }
): Promise<string | undefined> => {
  const { loopUser } = context;
  const since = acceptedAt(
    issue,
    await gitlab.labelEvents(issue.iid),
    loopUser
  );
  if (since === undefined) {
    return undefined;
  }
  // Every page: a missed edit would hand Duo text no one accepted.
  const notes = await gitlab.allIssueNotes(issue.iid);
  const edited = lastEdit(notes);
  if (edited !== undefined && Date.parse(edited) > Date.parse(since)) {
    await sendBack(gitlab, issue.iid);
    return undefined;
  }
  const denied = deniedReason(issue);
  if (denied !== undefined) {
    await toOwner(gitlab, issue.iid, { denied, loopUser });
    return undefined;
  }
  if (!hasAcceptanceCriteria(issue.description)) {
    if (!notes.some((n) => n.body.includes(marker("needs-criteria")))) {
      await gitlab.noteOnIssue(
        issue.iid,
        `The wovain loop will give this to Duo's Developer flow once it has acceptance criteria (an \`## Acceptance criteria\` section with at least one item).\n\n${marker("needs-criteria")}`
      );
    }
    return undefined;
  }
  return await handOff(gitlab, issue, since);
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
    const outcome = await considerOne(gitlab, issue, context);
    if (outcome !== undefined) {
      return outcome;
    }
  }
  return "nothing to hand off";
};

// Notes and edits on an issue from outside the trusted ids, after a time if
// given. With anyEdit, an edit by anyone counts (the original after its
// acceptance); otherwise only an edit by someone other than the loop's user.
const outside = (
  issue: Pick<Issue, "iid">,
  notes: Note[],
  context: { trust: Trust; since?: number; anyEdit: boolean }
) =>
  notes.flatMap((n) => {
    if (
      context.since !== undefined &&
      Date.parse(n.created_at) <= context.since
    ) {
      return [];
    }
    const who = `@${n.author.username}`;
    if (n.system) {
      const counts =
        context.anyEdit || n.author.id !== context.trust.loopUserId;
      return EDIT.test(n.body) && counts ? [`${who} edited #${issue.iid}`] : [];
    }
    return n.author.id !== undefined && context.trust.ids.has(n.author.id)
      ? []
      : [`${who} wrote on #${issue.iid}`];
  });

// Why the issue Duo works may have been steered: someone outside the loop
// and Duo wrote on it or edited it, or (for the loop's copy) its text no
// longer matches the hash recorded at hand-off, the owner's acceptance
// doesn't come before the loop's assignment, or its original was edited or
// written on after acceptance (or can't be found).
export const issueTampering = (
  issue: Pick<Issue, "description" | "iid" | "title">,
  notes: Note[],
  context: {
    trust: Trust;
    assignedAt: string | undefined;
    original?: { iid: number; notes: Note[] } | undefined;
  }
): string[] => {
  const { trust } = context;
  const reasons = outside(issue, notes, { anyEdit: false, trust });
  if (!isCopy(issue)) {
    return reasons;
  }
  const recorded = recordedAcceptance(notes, trust.loopUserId);
  if (recorded === undefined || recorded.hash !== contentHash(issue)) {
    reasons.push(`#${issue.iid} changed since the loop copied it`);
  }
  if (
    recorded === undefined ||
    context.assignedAt === undefined ||
    recorded.acceptedAt >= Date.parse(context.assignedAt)
  ) {
    reasons.push(`#${issue.iid} wasn't accepted before the loop assigned it`);
  }
  if (context.original === undefined) {
    reasons.push(`the accepted original of #${issue.iid} wasn't found`);
  } else if (recorded !== undefined) {
    reasons.push(
      ...outside({ iid: context.original.iid }, context.original.notes, {
        anyEdit: true,
        since: recorded.acceptedAt,
        trust,
      })
    );
  }
  return reasons;
};

// The original the loop copied into this copy: the agent::duo issue whose
// notes carry the loop's "handed" marker for it.
export const originalOf = async (
  gitlab: Pick<GitLab, "allIssueNotes" | "issues">,
  copy: number,
  trust: Trust
) => {
  const candidates = await gitlab.issues({
    labels: "agent::duo",
    state: "all",
  });
  const withNotes = await Promise.all(
    candidates.flatMap((c) =>
      isCopy(c)
        ? []
        : [gitlab.allIssueNotes(c.iid).then((notes) => ({ iid: c.iid, notes }))]
    )
  );
  return withNotes.find((c) =>
    c.notes.some(
      (n) =>
        n.author.id === trust.loopUserId && n.body.includes(handedMarker(copy))
    )
  );
};
