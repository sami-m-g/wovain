# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/191

## Why

A drop made one campaign per product, each with its own budget. With a small budget that spreads money thin and never compares designs: nobody learns which design sells. The founder's direction: a drop launches as a small multi-design test, the profit rules (#141) pause what doesn't sell, and the winner is scaled.

## What Changes

- A drop of 2 to 5 live designs is staged as one campaign on Meta's campaign budget (CBO) with an ad set per design and an ad per copy variant. Each ad set gets `daily_min_spend_target` at half the daily budget split evenly, so every design spends until the rules can judge it; CBO moves the other half to what sells. A single design stays a plain campaign with its old names and keys.
- `campaign.designs` keeps each design's product, ad set, ads, creatives and copy (migration `design_test`). `campaigns.test` launches a drop; the run workflow and the drop flow launch one test per 5 live designs.
- Activation and the paused read-back cover every ad set.
- The kill rules judge each design's ads on its own product's profit per sale.
- `campaigns.designs` and the campaign card show each design's spend, CTR, add-to-carts, sales, profit and rule status: testing, paused (with the rule's reason) or winner (the most profitable design with a sale).
- Insights reads each design's ad score and shows their mean for a test campaign.
- Docs (en/es/fr) and the landing FAQ explain the test.

## Impact

- `packages/core/src/{ads,ad-rules,media-buying}.ts`, `packages/db/src/schema/seller.ts`
- `packages/api/src/flow/{campaigns,design-results,insights,media,optimizer,runs}.ts`, `packages/api/src/routers/seller.ts`
- `apps/web/src/components/app/{design-results,campaign-controls,use-drop-flow}.tsx`, messages, docs
