# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/63

Stacks on the foundation change `foundation-autonomy-approvals` (#58, PR #60).

## Why

wovain stages each product's Meta campaign with two or three ad variants, then leaves it alone. Nothing watches the ads once the merchant starts the campaign: a variant nobody clicks keeps its delivery, and a campaign that works never gets more budget. Merchants who sell on demand can't watch Ads Manager every day, and the autopilot promise needs something that does, inside the limits they set.

## What Changes

- A scheduled optimizer (every 6 hours, and on demand through the `wovain/optimizer.tick` event) re-scores the ads of each live wovain campaign with a Beta-Bernoulli Thompson-sampling bandit over link clicks and impressions, and saves each ad's posterior, counts and share in `ad_optimizer_state`.
- From the scores it proposes at most one change per campaign per run:
  - pause an ad that has enough delivery of its own and is very unlikely to be the best one (`media.ad.pause`, R1)
  - raise or lower the campaign's daily budget by at most 20% (`media.budget.change`, R2, spends)
- Guards that no proposal can bypass:
  - The merchant's daily and monthly spend caps are hard limits. A raise never takes wovain's total daily budget past the daily cap, and the policy denies any raise past either cap.
  - Meta's learning phase is a floor. While an ad set is learning (Meta says so, or fewer than 50 results in the last 7 days, or a significant edit in the last 7 days), the optimizer proposes nothing.
  - The breakdown effect: ads in one ad set are judged at the ad set level. The ad Meta gives the most delivery is never paused, ads with too little delivery are not judged, and at least one ad stays active.
- A Nemotron reviewer on the REASONING model (`NEMOTRON_MODEL_REASONING`) reads each proposal with its evidence and can veto it. A failed review blocks the proposal.
- Every proposal goes through `canAutoExecute`, via the approval queue. Within the merchant's autonomy level it runs at once; otherwise it waits in the queue for the merchant. A budget change always waits.
- An executor runs approved optimizer actions on Meta, records the outcome on the approval and writes the audit log.
- Every read, score, guard, review, policy decision and write is saved to the decision trace.
- Everything is behind the `ads-optimizer` flag: on in development and next, off in production.

## Capabilities

### New Capabilities

- `ads-optimizer`: the scheduled bandit optimizer over a campaign's ads, its guards, the reasoning review and how its writes reach Meta.

### Modified Capabilities

None. The spec `ads-and-campaigns` says wovain never activates spend. The optimizer never activates a paused campaign or ad. It only changes the budget of a campaign the merchant already started, and only after the merchant approves. The media-buying workstream's rescope of that requirement covers live campaigns.

## Impact

- `packages/core`:
  - new `optimizer.ts` (the bandit and guards) and `optimizer-meta.ts` (Meta reads and writes)
  - new agent `ads_optimizer_review` on the reasoning model (`agents.ts`, `scorers.ts`, `core.ts`)
- `packages/api`:
  - new `flow/optimizer.ts` and `workflows/optimizer.ts` (three Inngest functions)
  - `workflows/engine.ts` registers them
- No new tables or migrations: it uses `ad_optimizer_state`, `approval`, `audit_event` and `decision_trace` from the foundation.
