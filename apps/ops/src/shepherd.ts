import { reviewSkipReason } from "./gates.ts";
import type { GitLab, Issue, MergeRequest, Note } from "./gitlab.ts";
import {
  blockers,
  diffLines,
  openThreads,
  outsiders,
  reviewDone,
  provenanceGaps,
  reviewedShaOf,
} from "./guardrails.ts";
import type { Provenance } from "./guardrails.ts";
import { acceptedBy } from "./intake.ts";
import { marker } from "./report.ts";
import { DEVELOPER, assignedAt, fromLoop } from "./scout.ts";

// The shepherd moves the Duo Developer flow's merge requests for scout issues
// through review to GitLab's auto-merge. Each step is a human action through
// the token's owner, because GitLab skips flow triggers for events a flow
// caused (ee/app/workers/concerns/ai/cloud_events_flow_trigger_worker.rb):
//   draft → marked ready and Duo Code Review requested (assign_reviewer)
//   ready, head not reviewed → Duo Code Review requested (assign_reviewer)
//   review threads open → Developer asked once to address them (mention)
//   provenance, guardrails, review of the head commit, pipeline → auto-merge
// It never merges anything itself, and asks for each review once per commit.

const REVIEWER = "duo-code-review-gitlab-ai-hackathon";
// The Developer flow is done pushing when its MR has been quiet this long.
const SETTLE_MS = 15 * 60_000;
// A review that hasn't landed by then is handed to a human.
const REVIEW_TIMEOUT_MS = 2 * 3_600_000;
// Pipeline states that auto-merge can wait on.
const PIPELINE_OK = new Set(["created", "pending", "running", "success"]);

// Posts a note unless an earlier run already posted one of this kind.
const once = async (
  gitlab: GitLab,
  mr: { iid: number; notes: Note[] },
  kind: string,
  body: string
) => {
  if (!mr.notes.some((n) => n.body.includes(marker(kind)))) {
    await gitlab.noteOnMergeRequest(mr.iid, `${body}\n\n${marker(kind)}`);
  }
};

const handBack = async (
  gitlab: GitLab,
  mr: { iid: number; notes: Note[] },
  reasons: string[]
) => {
  await once(
    gitlab,
    mr,
    "needs-human",
    `The wovain loop won't auto-merge this, so it needs a human:\n\n${reasons.map((r) => `- ${r}`).join("\n")}`
  );
  return "needs a human";
};

// The scout (or accepted agent::duo) issue GitLab binds this MR to: one it closes (closes_issues), or
// one whose number its source branch carries. Text in the MR is never used.
const boundIssue = async (
  gitlab: GitLab,
  mr: MergeRequest
): Promise<Issue | undefined> => {
  const closes = await gitlab.closesIssues(mr.iid);
  const fromBranch = [...mr.source_branch.matchAll(/\d+/gu)].map(Number);
  const candidates = [
    ...closes,
    ...(await Promise.all(
      fromBranch.map(async (iid) => await gitlab.issue(iid).catch(() => null))
    )),
  ];
  return candidates.find(
    (issue): issue is Issue =>
      issue !== null &&
      (issue.labels.includes("scout") || issue.labels.includes("agent::duo"))
  );
};

const provenanceOf = async (
  gitlab: GitLab,
  mr: MergeRequest,
  issue: Issue,
  loopUser: string
): Promise<Provenance> => {
  const [closes, issueNotes, sessions, events] = await Promise.all([
    gitlab.closesIssues(mr.iid),
    gitlab.issueNotes(issue.iid),
    gitlab.sessions(),
    gitlab.labelEvents(issue.iid),
  ]);
  return {
    developer: DEVELOPER,
    issue: {
      accepted: acceptedBy(issue, events, loopUser),
      assignedAt: assignedAt(issueNotes, loopUser),
      assignees: issue.assignees.map((a) => a.username),
      author: issue.author.username,
      fromLoop: fromLoop(issue),
      iid: issue.iid,
      labels: issue.labels,
    },
    loopUser,
    mr: {
      author: mr.author.username,
      closes: closes.map((i) => i.iid),
      iid: mr.iid,
      sourceBranch: mr.source_branch,
    },
    sessions,
  };
};

// Asks Duo Code Review for the head commit once; Duo is added to the existing
// reviewers, never in place of them.
const requestReview = async (gitlab: GitLab, mr: MergeRequest) => {
  const id = await gitlab.userId(REVIEWER);
  const others = mr.reviewers.flatMap((r) => (r.id === id ? [] : [r.id]));
  await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: others });
  await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: [...others, id] });
};

// The head pipeline's status, or "failed" when it isn't on the head commit
// or is in a state auto-merge mustn't wait on.
const pipelineOf = (mr: MergeRequest) => {
  const pipeline = mr.head_pipeline;
  return pipeline !== null &&
    pipeline !== undefined &&
    pipeline.sha === mr.sha &&
    PIPELINE_OK.has(pipeline.status)
    ? pipeline.status
    : "failed";
};

// The head commit has no finished Duo review: ask once, then wait, and hand
// a review that never lands to a person.
const awaitReview = async (
  gitlab: GitLab,
  state: {
    mr: MergeRequest;
    asked: Note | undefined;
    thread: { iid: number; notes: Note[] };
    now: Date;
  }
) => {
  const { asked, mr, now, thread } = state;
  if (asked === undefined) {
    await requestReview(gitlab, mr);
    await gitlab.noteOnMergeRequest(
      mr.iid,
      `Duo Code Review requested for ${mr.sha} by the wovain loop.\n\n${marker(`review:${mr.sha}`)}`
    );
    return "review requested";
  }
  return now.getTime() - Date.parse(asked.created_at) > REVIEW_TIMEOUT_MS
    ? await handBack(gitlab, thread, ["Duo Code Review didn't finish"])
    : "review running";
};

const shepherdOne = async (
  gitlab: GitLab,
  listed: MergeRequest,
  context: { now: Date; loopUser: string }
) => {
  if (listed.merge_when_pipeline_succeeds) {
    return "auto-merge already set";
  }
  const issue = await boundIssue(gitlab, listed);
  if (issue === undefined) {
    return "skip: not bound to a scout issue";
  }
  const [mr, notes, diffs, versions, reviewers, discussions] =
    await Promise.all([
      gitlab.mergeRequest(listed.iid),
      gitlab.mergeRequestNotes(listed.iid),
      gitlab.diffs(listed.iid),
      gitlab.versions(listed.iid),
      gitlab.reviewers(listed.iid),
      gitlab.discussions(listed.iid),
    ]);
  const duo = reviewers.find((r) => r.user.username === REVIEWER);
  const thread = { iid: mr.iid, notes };
  const gaps = provenanceGaps(
    await provenanceOf(gitlab, mr, issue, context.loopUser)
  );
  const paths = diffs.flatMap((d) => [d.old_path, d.new_path]);
  // Duo Code Review only for application code: never a docs-only,
  // lockfile-only or Renovate MR (gates.ts). The loop marks drafts ready
  // itself, so a draft still qualifies here.
  const skip = reviewSkipReason({
    draft: false,
    paths,
    sourceBranch: mr.source_branch,
  });
  if (skip !== undefined) {
    return await handBack(gitlab, thread, [
      `no Duo Code Review for this change (${skip})`,
    ]);
  }
  // Checks that need no review come first, so no review credits are spent
  // on an MR that can't be auto-merged anyway.
  const base = {
    draft: false,
    hasConflicts: mr.has_conflicts,
    lines: diffs.reduce((sum, d) => sum + diffLines(d.diff), 0),
    outsiders: outsiders(discussions, [REVIEWER, DEVELOPER, context.loopUser]),
    paths,
    pipeline: undefined,
    provenance: gaps,
    reviewedSha: mr.sha,
    reviewerState: "reviewed",
    sha: mr.sha,
    unresolved: 0,
  };
  const early = blockers(base);
  if (early.length > 0) {
    return await handBack(gitlab, thread, early);
  }
  if (context.now.getTime() - Date.parse(mr.updated_at) < SETTLE_MS) {
    return "settling";
  }
  const asked = notes.find((n) => n.body.includes(marker(`review:${mr.sha}`)));
  if (mr.draft) {
    // The Code Review trigger listens to assign_reviewer only, so marking
    // ready costs nothing; the review is requested next to it.
    await gitlab.updateMergeRequest(mr.iid, {
      title: mr.title.replace(/^\s*(?:\[draft\]|\(draft\)|draft:)\s*/iu, ""),
    });
    await requestReview(gitlab, mr);
    await gitlab.noteOnMergeRequest(
      mr.iid,
      `Marked ready and Duo Code Review requested for ${mr.sha} by the wovain loop.\n\n${marker(`review:${mr.sha}`)}`
    );
    return "marked ready, review requested";
  }
  const reviewedSha = reviewedShaOf(
    notes.map((n) => ({
      author: n.author.username,
      createdAt: n.created_at,
      headSha: n.position?.head_sha,
    })),
    versions.map((v) => ({
      createdAt: v.created_at,
      headSha: v.head_commit_sha,
    })),
    REVIEWER
  );
  if (reviewedSha !== mr.sha || !reviewDone(duo?.state)) {
    return await awaitReview(gitlab, { asked, mr, now: context.now, thread });
  }
  const unresolved =
    openThreads(discussions, REVIEWER) +
    (duo?.state === "requested_changes" ? 1 : 0);
  const reasons = blockers({
    ...base,
    draft: mr.draft,
    pipeline: pipelineOf(mr),
    reviewedSha,
    reviewerState: duo?.state,
    unresolved,
  });
  if (reasons.length === 0) {
    await gitlab.setAutoMerge(mr.iid, mr.sha);
    await gitlab.noteOnMergeRequest(
      mr.iid,
      `Auto-merge set by the wovain loop for ${mr.sha}: the loop assigned #${issue.iid}, Duo's Developer flow wrote this in the session that assignment started, Duo Code Review reviewed this commit and left no open threads, no one outside the loop wrote on it, and the change stays inside the guardrails (apps/ops/src/guardrails.ts). GitLab merges it once the pipeline passes.\n\n${marker("auto-merge")}`
    );
    return "auto-merge set";
  }
  // Only Duo's own threads, and only when nothing else blocks the MR.
  if (unresolved > 0 && reasons.every((r) => r.includes("Duo review thread"))) {
    await once(
      gitlab,
      thread,
      "fix-review",
      `@${DEVELOPER} please address the open review threads on this merge request and resolve each one.`
    );
    return "asked Developer to fix review";
  }
  return await handBack(gitlab, thread, reasons);
};

export const shepherd = async (gitlab: GitLab, now: Date) => {
  const [mrs, me] = await Promise.all([
    gitlab.mergeRequests({ author_username: DEVELOPER, state: "opened" }),
    gitlab.currentUser(),
  ]);
  const outcomes = await Promise.allSettled(
    mrs.map(
      async (mr) =>
        await shepherdOne(gitlab, mr, { loopUser: me.username, now })
    )
  );
  return Object.fromEntries(
    mrs.map((mr, i) => {
      const outcome = outcomes[i];
      return [
        mr.iid,
        outcome?.status === "fulfilled"
          ? outcome.value
          : `failed: ${outcome?.reason instanceof Error ? outcome.reason.message : "unknown"}`,
      ];
    })
  );
};
