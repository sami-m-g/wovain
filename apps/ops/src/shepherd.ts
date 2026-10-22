import type { GitLab, MergeRequest } from "./gitlab.ts";
import { blockers, diffLines } from "./guardrails.ts";
import { marker } from "./report.ts";
import { DEVELOPER } from "./scout.ts";

// The shepherd moves the Duo Developer flow's merge requests for scout issues
// through review to GitLab's auto-merge. Each step is a human action through
// the token's owner, because GitLab skips flow triggers for events a flow
// caused (ee/app/workers/concerns/ai/cloud_events_flow_trigger_worker.rb):
//   draft → marked ready (starts Code Review: merge_request_ready)
//   ready, not reviewed → Duo Code Review requested (assign_reviewer)
//   review threads open → Developer asked once to address them (mention)
//   guardrails pass → auto-merge set; GitLab merges when the pipeline passes
// It never merges anything itself.

const REVIEWER = "duo-code-review-gitlab-ai-hackathon";
// The Developer flow is done pushing when its MR has been quiet this long.
const SETTLE_MS = 15 * 60_000;

const scoutIssueIn = async (gitlab: GitLab, mr: MergeRequest) => {
  const refs = [
    ...(mr.title + (mr.description ?? "")).matchAll(/#(?<iid>\d+)/gu),
  ].map((m) => Number(m.groups?.["iid"]));
  const closes = await gitlab.closesIssues(mr.iid);
  const candidates = new Set([...refs, ...closes.map((i) => i.iid)]);
  if (candidates.size === 0) {
    return false;
  }
  const scoutIssues = await gitlab.issues({ labels: "scout", state: "all" });
  return scoutIssues.some((issue) => candidates.has(issue.iid));
};

// Posts a note unless an earlier run already posted one of this kind.
const once = async (
  gitlab: GitLab,
  mr: { iid: number; notes: { body: string }[] },
  kind: string,
  body: string
) => {
  if (!mr.notes.some((n) => n.body.includes(marker(kind)))) {
    await gitlab.noteOnMergeRequest(mr.iid, `${body}\n\n${marker(kind)}`);
  }
};

const shepherdOne = async (gitlab: GitLab, mr: MergeRequest, now: Date) => {
  if (mr.merge_when_pipeline_succeeds || !(await scoutIssueIn(gitlab, mr))) {
    return "skip";
  }
  if (now.getTime() - new Date(mr.updated_at).getTime() < SETTLE_MS) {
    return "settling";
  }
  if (mr.draft) {
    await gitlab.updateMergeRequest(mr.iid, {
      title: mr.title.replace(/^\s*(?:\[draft\]|\(draft\)|draft:)\s*/iu, ""),
    });
    return "marked ready";
  }
  const [commits, notes, diffs, reviewers] = await Promise.all([
    gitlab.commits(mr.iid),
    gitlab.mergeRequestNotes(mr.iid),
    gitlab.diffs(mr.iid),
    gitlab.reviewers(mr.iid),
  ]);
  // Done means Duo submitted its review (not just its "started" note) and
  // wrote after the latest commit; a review of an older commit is redone.
  const head = new Date(commits[0]?.committed_date ?? 0);
  const duo = reviewers.find((r) => r.user.username === REVIEWER);
  if (duo?.state === "unreviewed") {
    return "review running";
  }
  const reviewed =
    duo !== undefined &&
    notes.some(
      (n) => n.author.username === REVIEWER && new Date(n.created_at) > head
    );
  if (!reviewed) {
    const id = await gitlab.userId(REVIEWER);
    await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: "" });
    await gitlab.updateMergeRequest(mr.iid, { reviewer_ids: String(id) });
    return "review requested";
  }
  const unresolved =
    notes.filter((n) => n.resolvable && !n.resolved).length +
    (duo?.state === "requested_changes" ? 1 : 0);
  const reasons = blockers({
    closesScoutIssue: true,
    draft: mr.draft,
    hasConflicts: mr.has_conflicts,
    lines: diffs.reduce((sum, d) => sum + diffLines(d.diff), 0),
    paths: diffs.flatMap((d) => [d.old_path, d.new_path]),
    pipeline: mr.head_pipeline?.status,
    reviewed,
    unresolved,
  });
  if (reasons.length === 0) {
    await gitlab.setAutoMerge(mr.iid, mr.sha);
    await gitlab.noteOnMergeRequest(
      mr.iid,
      `Auto-merge set by the wovain loop: Duo Code Review is done with no open threads, the change stays inside the guardrails (apps/ops/src/guardrails.ts), and GitLab merges it once the pipeline passes.\n\n${marker("auto-merge")}`
    );
    return "auto-merge set";
  }
  if (unresolved > 0) {
    await once(
      gitlab,
      { iid: mr.iid, notes },
      "fix-review",
      `@${DEVELOPER} please address the open review threads on this merge request and resolve each one.`
    );
    return "asked Developer to fix review";
  }
  await once(
    gitlab,
    { iid: mr.iid, notes },
    "needs-human",
    `The wovain loop won't auto-merge this, so it needs a human:\n\n${reasons.map((r) => `- ${r}`).join("\n")}`
  );
  return "needs a human";
};

export const shepherd = async (gitlab: GitLab, now: Date) => {
  const mrs = await gitlab.mergeRequests({
    author_username: DEVELOPER,
    state: "opened",
  });
  const outcomes = await Promise.all(
    mrs.map(async (mr) => await shepherdOne(gitlab, mr, now))
  );
  return Object.fromEntries(mrs.map((mr, i) => [mr.iid, outcomes[i]]));
};
