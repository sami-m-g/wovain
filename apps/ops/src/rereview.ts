// GitLab Duo's change requests on any open merge request. With "GitLab Duo
// can approve and request changes" on (duo_code_review_decisions_enabled),
// Duo requests changes whenever it opens a thread, and GitLab's merge check
// blocks the merge until Duo approves in a follow-up review, or a person
// bypasses it (docs: Code Review Flow, "Approvals and change requests").
// Resolving the threads doesn't clear it, so once every Duo thread is
// resolved and the head pipeline passed, the ops job re-requests Duo's review
// (what the reviewer list's "Re-request a review" does). Duo approves when it
// finds nothing new, which clears the block; new findings start the cycle
// again. Duo is never removed as a reviewer.

// GitLab's own Duo reviewer on gitlab.com, whatever flow runs the review.
export const DUO_USER = "GitLabDuo";

// Re-reviews per merge request before a person decides; each one spends
// credits.
export const MAX_REREVIEWS = 3;

export interface ChangeRequest {
  draft: boolean;
  // Duo's reviewer state: unreviewed, review_started, reviewed,
  // requested_changes or approved.
  state: string | undefined;
  // The head pipeline's status, when it ran on the head commit.
  pipeline: string | undefined;
  // Duo's threads still unresolved.
  openThreads: number;
  // Duo's latest "requested changes" system note: one re-review each.
  requestId: number | undefined;
  // Re-reviews the ops job asked for so far, and whether for this request.
  asked: number;
  askedForThis: boolean;
}

export type Rereview =
  | { action: "rereview" }
  | { action: "cap" }
  | { action: "wait"; reason: string };

export const rereviewOf = (c: ChangeRequest): Rereview => {
  if (c.state !== "requested_changes" || c.requestId === undefined) {
    return { action: "wait", reason: "Duo doesn't request changes" };
  }
  if (c.askedForThis) {
    return { action: "wait", reason: "re-review already requested" };
  }
  if (c.draft) {
    return { action: "wait", reason: "draft" };
  }
  if (c.openThreads > 0) {
    return {
      action: "wait",
      reason: `${c.openThreads} unresolved Duo thread(s)`,
    };
  }
  if (c.pipeline !== "success") {
    return { action: "wait", reason: `pipeline ${c.pipeline ?? "missing"}` };
  }
  if (c.asked >= MAX_REREVIEWS) {
    return { action: "cap" };
  }
  return { action: "rereview" };
};
