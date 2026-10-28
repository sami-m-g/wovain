# Design

## Context

Wovain stages each Meta campaign the same way (`packages/core/src/ads.ts`):

- a traffic objective (`OUTCOME_TRAFFIC`, optimizing link clicks)
- a campaign budget (CBO)
- one ad set
- two or three ads

The foundation gives:

- an `ad_optimizer_state` row per ad
- the approval queue, with its policy (`canAutoExecute`), audit log and `approval.decided` event
- decision traces
- the model router

There is no pixel, so purchases are not known. The bandit's reward is a link click per impression.

## Goals / Non-Goals

**Goals:**

- Honest, explainable reallocation that can't spend past the merchant's caps.
- Safe defaults:
  - nothing runs while the flag is off
  - nothing runs while Meta is learning
  - no budget change without the merchant's approval

**Non-Goals:**

- Per-ad budgets. Meta has no per-ad budget in one ad set, so the levers are pausing an ad and the campaign budget.
- Purchase or ROAS rewards, which need the pixel and CAPI (the media-buying workstream).
- Qloo-informed priors. The posterior starts at Beta(1, 1).
- A UI. The approvals list and traces come from the foundation's procedures.

## Decisions

1. **Thompson sampling over Beta-Bernoulli, hand-rolled.**
   - This was the founder's decision; Robyn needs months of data.
   - Gamma draws use Marsaglia–Tsang, and P(best) is the share of 4,000 joint draws each ad wins.
   - The RNG is injectable, so tests are deterministic.
2. **One edit per campaign per run.** Meta resets learning on significant edits, and two edits at once can't be told apart. A pause goes before a budget change.
3. **Learning floor from three signals.** Meta's `learning_stage_info` when the MCP returns it. Otherwise fewer than 50 results in the last 7 days, from the 7-day ad set insights. Wovain's own last edit (`params.lastEditAt` on the state rows) counts too. Any one of the three blocks changes.
4. **Breakdown-effect rules** are adapted from mathiaschu/meta-ads-analyzer (MIT): ads in one ad set are evaluated at the ad set level, and average cost per result in a breakdown is never used alone. So:
   - The top-spend ad is never paused.
   - An ad needs 1,000 impressions of its own before it is judged.
   - At least one ad stays active.
5. **Budget rule.**
   - The ad set's pooled CTR posterior is checked against a 0.9% floor (the traffic benchmark).
   - P(CTR > floor) > 0.9 raises the budget 20%, clamped so wovain's total daily budget stays at or under the daily cap.
   - P(CTR > floor) < 0.1 lowers it 20%, never below $1.
   - The policy gets the raise as `spendCents`, so it also checks the spend to date against the caps.
6. **Reasoning review.**
   - A new Mastra agent `ads_optimizer_review` runs on `NEMOTRON_MODEL_REASONING` through the agent kit, with PostHog tracing like the other agents.
   - It returns `{ approve, reason }`. A veto or a failure drops the proposal.
7. **Execution through events.**
   - The tick enqueues; the executor listens for `wovain/approval.decided` with status `approved` and an optimizer action type.
   - It handles only approvals with `proposedBy = "optimizer"`, so another workstream's executor for the same action types won't double-run.
   - `record` moves `approved → executing → done | failed`. A retry of an approval no longer `approved` is a no-op.
8. **Inngest layout.**
   - `ads-optimizer-cron` (every 6 h) fans out one `optimizer.tick` per merchant with a campaign.
   - `ads-optimizer-tick` handles the tick with concurrency 1 per merchant.
   - `ads-optimizer-execute` performs approved actions.

## Risks / Trade-offs

- **CTR is not sales.** Until purchases are tracked, the optimizer favors attention. The reviewer prompt and the trace both say so.
- **Snapshots.** `spendToDate` reads `performance_snapshot` (meta, campaign). Until the feedback loop writes those rows, it reports 0 spent. The optimizer's own clamp (total daily budgets ≤ daily cap) still holds.
- **Meta MCP field names** (`learning_stage_info`, `daily_budget`) are parsed leniently. A missing field falls back to the rule-based signals and to wovain's saved budget.
- **Meta App Review** for `ads_mcp_management` is needed for real merchants' accounts.
