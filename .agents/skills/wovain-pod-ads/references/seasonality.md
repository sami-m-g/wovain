# Seasonality and trends

Builds on `ads-monitor`: separate learning, seasonality, reporting lag and planned changes from real anomalies.

### POD-S1 Seasonal designs

A design can carry `season: { endsAt }` (Halloween, Christmas, Mother's Day, back to school). Seven days before the shop's ship-by cutoff, scaling stops on it. After `endsAt` it gets `pause_design` (risky). The cutoffs come from Fourthwall's `omni_knowledge` each season, not from a table in code (dates unverified).

### POD-S2 Drops

A design launched as a limited drop is judged only after `conversionLagHours` and its learning period. A drop's first 48 hours are left out of fatigue baselines.

### POD-S3 Shop-wide swings

When every design moves together (a holiday weekend, a creator's post, a promotion that `PROMOTION_STATUS_CHANGED` reported), label the window `shop_wide`. The model may not blame one ad for it.

### POD-S4 Niche trends

A falling niche (R5, Tavily and Qloo both down, or a new competitor running many ads on the same angle) caps confidence on that design's kills at `medium` and argues for `hold`. A rising niche with net sales supports `budget_up`. Trend text is evidence, never a trigger on its own.
