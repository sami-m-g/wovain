# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/77

## Why

Every run makes one square image and prints it on the front of one tee, at Fourthwall's default size and position. Fourthwall gets no colors or sizes, so the product sells in the blank's first color and first size only. A brand doesn't sell one tee: it sells a drop, a small set of products that look like one label, with a statement print on the back, a quiet mark on the chest, embroidery where it suits and a label in the neck. Qloo's taste data only names the theme today. It should also decide what gets made.

## What Changes

Behind the `design-drops` flag (on in dev and next, off in production):

- **Variants.** A single-design product is previewed in the brief's garment colors, matched to the blank's colors, and in every size the blank comes in.
- **Placement plan per product.** Each product kind has pieces of art with a region, a placement, a size and an offset. The hero tee or hoodie gets a large back print set high and a left-chest mark. Long sleeves get sleeve text, and hats and crewnecks get an embroidered mark. Code resolves the plan against the blank's real print areas, never uses both sizes of one area, and covers required areas.
- **Art pipeline per art type.** GPT Image draws the back graphic on a transparent background at the region's aspect. A vector model (Recraft) draws the mark in the drop's palette. Embroidery reuses the mark, with its colors snapped to at most 6 and rasterized in code. A vector model (Ideogram) sets the sleeve type, and a tiling model (Ideogram) draws the all-over pattern, which code repeats over the region. Code draws the neck label with no AI. Raster art without transparency goes through BiRefNet, and raster art below the method's DPI through an upscaler. Every result is a PNG at the region's exact pixels, with hard alpha edges. The fal model IDs come from `FAL_IMAGE_MODEL` and the new `FAL_ART_MODELS`, both set from Pulumi config.
- **Drops.** A drop is 4 to 6 products. The Qloo tags of the idea's run, plus the brand's niches, pick a style family (code, traced with the Qloo tags as sources), and the family picks the mix. Nemotron writes one brief for the whole drop: palette, graphic, mark, sleeve words, pattern, and a listing per product. Each art type is drawn once per drop and charged as one design, so every product shares the same art.
- **Composition and placement checks.** Code reads facts from each finished placement: DPI at print size, aspect against the region, transparency, "slab" (a solid rectangle instead of a shape) and thread colors on embroidery. Nemotron's vision model looks at one mockup per product for placement fit, hierarchy (statement back, quiet front) and the drop's cohesion.
- **Mockups of all placements.** Each product is previewed once with every region, placement, offset, color and size, and the drop page shows every mockup.
- **Price from real costs.** Each product is priced from what Fourthwall charges to make that customization (`get-customization-pricing`, the costliest size), through the pricing rules. When that reply can't be read, it is logged at error level and the price uses the blank's price plus each extra print area's price from the catalog. The page shows which source was used.
- **Publishing.** Publishing a drop is one `store.drop.publish` approval. Once it is approved (by the merchant or by the policy), an Inngest function creates the products and a Fourthwall collection, then makes the collection and its products public.

## Capabilities

### New Capabilities

- `design-drops`: drops, placement plans, art types, composition checks and cost-based prices.

### Modified Capabilities

- `design-generation`: a single design's product is sold in the brief's colors and every size.

## Impact

- `packages/core`: `drops.ts` (style families, mixes, placement plans, colors, prices), `art.ts` (fal requests per art type, post-processing with sharp, code facts), `drop-brief.ts` (the drop brief and the mockup vision check), `fourthwall-drops.ts` (catalog details, multi-region previews, customization pricing, collections, PNG upload), and a generic fal job runner in `fal.ts`. Adds `sharp` (catalog).
- `packages/api`: `flow/drops.ts`, `flow/variants.ts`, the `drops` router, and the `drop-build` and `drop-publish` Inngest functions. Adds one event, `wovain/drop.build.requested`. No migration: the drop and its products use the foundation's `drop` and `drop_item` tables.
- `apps/web`: `/dashboard/drops`, a sidebar item while the flag is on, and messages in en, es and fr.
- Config: `FAL_ART_MODELS` in `apps/web/.env.schema`, `falArtModels` (with `-dev` and `-next`) in Pulumi config, CI's env and `turbo.json`.
