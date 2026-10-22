# Spec: One zod source for the breakeven, quote, rule and artwork shapes

Intent: [intent.md](intent.md)

## Requirements

- `economics.ts` exports `breakevenSchema` (`Breakeven` is its `z.infer`) and `quoteSchema` (`PriceQuote`), the quote as designs store it.
- `priceProduct` returns that stored quote, so `toDesignQuote` goes.
- `rules.ts` exports `ruleThresholdsSchema`; `ruleThresholds` returns its `z.infer`.
- `ad.ts` derives the ad's `economics` from `quoteSchema` and `breakevenSchema`, and its `rules` from `ruleThresholdsSchema`.
- `show_ad_widget` builds the economics by spreading `breakeven(...)`. The store's `put` parses with `adSchema`, which drops `perSale` and `salesTax`, so the stored ad keeps its old fields.
- The stored schemas move to `packages/shared`: `stagedArtworkSchema` (design.ts), `savedCampaignSchema` (campaign.ts), `adMediaSchema` (ad.ts) and `briefRecordSchema` (trends.ts).
- `stage_artwork`'s output is `stagedArtworkSchema.omit(...).extend(...)`.

## Design

- No stored field is renamed, added or removed, so every old document parses unchanged. `test/unit/stored-records.test.ts` pins that with fixtures in the old shape.
- `priceProduct` keeps its name and its `.price`; the optimizer reads only `.price` from it.
- No library beyond zod is needed: `pick`, `omit`, `extend` and `z.infer` cover the derivations.

## Areas of concern

- Stored shapes: unchanged by construction, and checked by the fixture test plus the existing pre-concepts ad test.
- `quote_product` returns the same fields as before.
