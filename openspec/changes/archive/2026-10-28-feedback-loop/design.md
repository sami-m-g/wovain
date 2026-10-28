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

A source's first snapshot (no rows yet for that merchant and source) reads back to the day the oldest public product went on sale, at most 28 days, four days at a time so it stays within the providers' limits. After that, each run reads the last 3 days.

When one provider fails, the failure is logged at error level and the other provider's rows are still saved.

## Schedule

A daily Inngest cron lists the merchants with Fourthwall or Meta connected and sends one `wovain/feedback.learn` event each. A separate function handles each event, with concurrency 1 per merchant and 2 overall, and 2 retries. A merchant whose loop still fails is logged at error level by the function's `onFailure` (PostHog Error Tracking), and the other merchants' runs go on.

## Outcomes and reward

An idea counts once one of its products has been public for `MIN_LIVE_DAYS` (3). Each product is measured over a fixed window, its first 28 days for sale (UTC days from its `createdAt`), so old and new products compare on the same footing. A product that went on sale before the merchant's first Fourthwall snapshot doesn't count: part of its window was never read, and counting it would label it unsold.

`reward = sales` without ad data, or `0.7 × sales + 0.3 × ctrScore` when its ads had at least 500 impressions, where `sales = 1 − e^(−units/3)` and `ctrScore = min(1, CTR / (2 × 0.9%))`.

## Weight fit

The features are the seven terms of `scoreIdea`, each 0 to 1. For each feature, `corr` is the Pearson correlation of the feature with the reward across the merchant's counted ideas (0 when either has no variance). With `n` samples and confidence `c = n / (n + 10)`:

`w = prior × (1 + 0.5 × c × corr)`, then normalised to sum to 1.

So a weight moves at most about ±50% from its default, and only as far as the evidence allows. The fit runs from scratch on all the data each time, so it does not drift. With fewer than 3 samples, the defaults stay.

A fit is saved as a `decision_trace` row (`agent: feedback_loop`, `step: score_weights`). Its output holds the version, the weights, the correlations, the sample count and the learnings. The version goes up only when a weight changed by more than 0.001. Research reads the newest row; with none, version 0 is the defaults.

Reading the newest fit and saving the next one happen in one transaction that holds `pg_advisory_xact_lock(hashtext('feedback_loop:<userId>'))`, so the daily run and "Check results now" take turns and never save the same new version. The snapshot itself runs before the lock: its upserts are idempotent. "Check results now" reuses a fit less than 5 minutes old instead of reading the providers again.

## Learnings

The top 3 ideas with sales (by units, then revenue) and up to 3 ideas with none are saved as numbers: `{ ideaId, theme, units, revenueCents, ctr? }`. The Insights page formats them with next-intl in the merchant's language. For working memory and `research_themes`, the same results become English lines, such as `Retro slasher VHS: 4 sold, $96.00 revenue, CTR 1.8%`. They replace the two memory sections and go to the prompt as `learned: { sold, unsold }`, which the system prompt treats as data.

Revenue shows in USD, as on the rest of the Insights page: wovain doesn't read the shop's currency yet.

## Alternatives

- A `score_weights` column or table: it needs a migration that would clash with the parallel workstreams' migrations. The decision trace already gives an append-only, versioned and explainable record.
- Online gradient updates: they drift and depend on order. The closed-form fit anchored on the prior is reproducible and easy to explain.
