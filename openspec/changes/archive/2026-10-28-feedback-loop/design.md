# Design

## Snapshots

`performance_snapshot` holds one row per `(user, source, level, entity, UTC day)`, upserted. The loop reads each of the last `SNAPSHOT_DAYS` (3) days separately, so rows stay daily and the spend caps (which sum Meta campaign rows) never double count.

| Source | Level | Entity | From |
| --- | --- | --- | --- |
| fourthwall | product | Fourthwall offer ID (`productId` is the wovain product) | Top products by units sold, one day at a time, matched by design title |
| fourthwall | drop | run ID | The sum of its products; `raw` keeps `published` and `sold` for sell-through |
| meta | campaign | Meta campaign ID | `ads_get_ad_entities` with a one-day `time_range` |
| meta | ad | Meta ad ID | The same, at `level: ad` |

Meta's `purchase_roas` sets `revenueCents` to ROAS times spend. Purchases stay 0: wovain's campaigns optimise for traffic and there is no pixel yet. CTR and CPC are computed from clicks, impressions and spend.

When one provider fails, the failure is logged at error level and the other provider's rows are still saved.

## Outcomes and reward

An idea counts once one of its products has been public for `MIN_LIVE_DAYS` (3). Its outcome sums the last 28 days of snapshots of its products and their campaigns.

`reward = sales` without ad data, or `0.7 × sales + 0.3 × ctrScore` when its ads had at least 500 impressions, where `sales = 1 − e^(−units/3)` and `ctrScore = min(1, CTR / (2 × 0.9%))`.

## Weight fit

The features are the seven terms of `scoreIdea`, each 0 to 1. For each feature, `corr` is the Pearson correlation of the feature with the reward across the merchant's counted ideas (0 when either has no variance). With `n` samples and confidence `c = n / (n + 10)`:

`w = prior × (1 + 0.5 × c × corr)`, then normalised to sum to 1.

So a weight moves at most about ±50% from its default, and only as far as the evidence allows. The fit runs from scratch on all the data each time, so it does not drift. With fewer than 3 samples, the defaults stay.

A fit is saved as a `decision_trace` row (`agent: feedback_loop`, `step: score_weights`). Its output holds the version, the weights, the correlations, the sample count and the learnings. The version goes up only when a weight changed by more than 0.001. Research reads the newest row; with none, version 0 is the defaults.

## Learnings

The top 3 ideas with sales (by units, then revenue) and up to 3 ideas with none become plain lines, such as `Retro slasher VHS: 4 sold, $96.00 revenue, CTR 1.8%`. They are written into working memory, replacing the two sections, and passed to `research_themes` as `learned: { sold, unsold }`, which the system prompt treats as data.

## Alternatives

- A `score_weights` column or table: it needs a migration that would clash with the parallel workstreams' migrations. The decision trace already gives an append-only, versioned and explainable record.
- Online gradient updates: they drift and depend on order. The closed-form fit anchored on the prior is reproducible and easy to explain.
