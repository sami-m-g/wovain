# Proposal

Issue: #71 (https://github.com/sami-m-g/wovain/issues/71). Stacks on `foundation-autonomy-approvals` (#58, PR #60).

## Why

Research ranks ideas with fixed weights (`SCORE_WEIGHTS`), and taste memory learns only from the merchant's approve and reject. What sold on Fourthwall and how the ads did on Meta never reach the next run: `trends.ts` and `themes.ts` ignore it, and the Insights page only reads.

## What Changes

Behind the `feedback-loop` flag (on in development and next, off in production):

- **Snapshots.** wovain saves one row per day per entity in `performance_snapshot`: Fourthwall units and revenue per wovain product, drop sell-through, and Meta spend, impressions, clicks and ROAS per campaign and per ad (CTR and CPC follow from them). A daily Inngest cron snapshots the last few days for each merchant with a connection; the Insights page can also ask for it.
- **Learnings.** Each idea that had a public product live for at least 3 days gets an outcome (units, revenue, CTR). The ideas that sold and the ones that didn't become short learnings.
- **Taste memory.** The learnings replace a "What sold" and a "What didn't sell" section in the merchant's working memory, which the brief writer and the ad copywriter already read.
- **Research prompts.** The `research_themes` prompt gets the learnings as data: lean toward what sold, and don't repeat what didn't.
- **Score weights.** The idea score weights are re-fit per merchant with a bounded update around the defaults (the prior). Each fit is saved as a decision trace with a version number, and research scores ideas with the latest version.
- **What we learned.** The Insights page shows the learnings, the weights against the defaults, the version and how many ideas the fit used.

## Capabilities

### New Capabilities

- `feedback-loop`: performance snapshots, learnings into taste memory and research, per-brand score weights, and the "What we learned" panel.

### Modified Capabilities

None.

## Impact

- `packages/core`: `feedback.ts` (new), `score.ts` (a weights parameter), `insights.ts` (per-day and ad-level Meta reads), `themes.ts` and `trends.ts` (learnings and weights in), `taste.ts` (the learnings sections).
- `packages/api`: `flow/feedback.ts`, `routers/feedback.ts`, `workflows/feedback.ts` (the daily cron), `flow/ideas.ts`.
- `apps/web`: a "What we learned" section on the Insights page.
- No new tables and no migration: snapshots use `performance_snapshot`, and weight versions use `decision_trace`.
