# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/195

## Why

The feedback loop re-fits the idea-score weights, but since #109 what sold no longer steers themes, and the per-design results from #173 never meet the drop data. wovain cannot say which angles sell for a merchant, so its ranking, its tests and its kill rules ignore the merchant's own track record.

## What Changes

- **Outcomes per design**: a `design_outcome` row per published product (migration `design_outcome`) with its angles (theme, Qloo tags and entities, audience, palette, price, blank, drop) against Meta's lifetime spend, clicks, impressions, add-to-carts and purchases, and Fourthwall's units and revenue. Upserted by the optimizer tick (Meta) and the daily Inngest loop (everything), so reruns overwrite.
- **Learning per merchant** (`@wovain/core/outcomes`): each design is a trial, a win when it made a profit after ads. Each angle gets a Beta-Binomial posterior whose prior mean is the merchant's win rate, itself shrunk toward an anonymised global rate (counts only). An angle is called a winner or a loser only when the posterior probability that it beats the merchant's rate is at least 0.8 (Beta CDF from `@stdlib/stats-base-dists-beta-cdf`).
- **Use**:
  - `outcomeScore(idea, model)` is a pure multiplier (0.5 to 2) with its evidence and reason, for the "what sells now" ranking.
  - A drop's test splits its spend floor half evenly and half by each design's multiplier.
  - Once the merchant's ads have made 10 purchases (`realCpaMinPurchases`), the kill rules' target cost per sale is the lower of the profit per sale and the real cost per sale (spend over purchases, shrunk toward the profit per sale by 3 purchases).
- **Show**: Insights > What we learned lists the confident angles, for example "Why this: your last 2 cottagecore drops made $84" (en, es, fr).
- Behind the `feedback-loop` flag: on in development and next, off in production.

## Impact

- `packages/core/src/{outcomes,ad-rules,ads}.ts`, `packages/db/src/schema/autonomy.ts`, migration `design_outcome`
- `packages/api/src/flow/{outcomes,feedback,optimizer,campaigns,design-results}.ts`, `packages/api/src/routers/media.ts`
- `apps/web/src/components/insights/{what-we-learned,outcome-why}.tsx`, messages, guide (en/es/fr), PRD
