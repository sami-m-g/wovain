# Design

## Context

The foundation (PR #60) added `drop` and `drop_item`, the one approval queue, decision traces, Inngest events and the `design-drops` flag. Fourthwall's MCP tools take several regions per preview, with placements, fractions, offsets, colors and sizes, and return a per-size cost for a customization. fal runs every model this needs. The research behind this change is in `design-quality.md` (2026-10-28): the catalog, file rules, models with prices, what sells and the proposed pipeline.

## Goals / Non-Goals

**Goals**

- A product reads as designed: a big back print, a small chest mark, sleeve text, embroidery and a label, each at the right size and DPI.
- Qloo decides what gets made, not only the theme.
- Facts code can check are decided by code. The vision model judges what code can't.
- Prices follow what Fourthwall really charges.

**Non-Goals**

- A brand kit editor. The drop uses `brand_profile.palette` and `display_name` when they are set; the onboarding workstream fills them.
- Editing a placement after the preview (`edit-design`, `add-design-region`).
- Changing the single-design run beyond its variants.

## Decisions

1. **Style family from tags, in code.** `chooseStyleFamily` scores each family by the tags that contain one of its words. The most votes win, with streetwear as the default. `DROP_MIX` maps each family to 4 to 6 product kinds. This is deterministic, testable and explainable ("chosen from these Qloo tags"), and the decision trace records it with the Qloo tag IDs as sources. Nemotron writes for the mix and never picks it.
2. **Placement plans as data.** `PRODUCT_KINDS` lists, for each kind, a catalog query and production method, and pieces (art type, preferred region names, placement, fraction, offset). `planPlacements` matches the names to the blank's real print areas (equal names first, then names that contain them). It never uses `front` and `front_large` (or `back` and `back_large`) together, drops a placement the area doesn't offer, and covers required areas. Print size comes from a table of inches by region, placement and kind (Fourthwall publishes no sizes), and pixels come from the method's DPI (150 for apparel, 300 for printed goods and stickers).
3. **One art set per drop.** Each art type is drawn once per drop. Embroidery reuses the mark, so the hat and the chest show the same mark. Each fal submit is keyed (`drop:<id>:art:<type>`) and charged as one design; reading a result again is free. Each placement then gets its own finished PNG at its own pixels.
4. **Finish in code with sharp.** sharp (libvips, Apache-2.0, already allowed to build in this workspace) rasterizes SVG at the right density, tiles patterns, fits raster art into the region and hardens alpha. It also reads the facts: size, alpha, opaque fill of the art's box, transparent share and distinct colors. Embroidery colors are snapped in the SVG source to the palette's first 6 colors before rasterizing.
5. **Cutout and upscale only when needed.** Raster art without an alpha channel goes through `cutout` (BiRefNet); patterns are opaque by design and skip it. Raster art below the method's width goes through `upscale` (Recraft crisp). A tile needs the DPI of one repeat, not of the region.
6. **Model IDs as config.** GPT Image stays `FAL_IMAGE_MODEL`. The rest is one JSON variable, `FAL_ART_MODELS` (`cutout`, `pattern`, `typographic`, `upscale`, `vector`), validated strictly and read only when a drop needs it, like `PRICING_RULES`. Prices checked with the fal MCP on 2026-10-28: Recraft V4.1 vector $0.08, Ideogram vector $0.01 per unit, Ideogram tiling $0.045, BiRefNet $0.000575 per compute second, Recraft crisp $0.004, GPT Image 2.5 billed in units.
7. **No migration.** `drop.brief` holds the drop's state (brief, matched tags, skipped kinds, checks, collection slug). `drop_item.regions` holds each placement under its region name and the product's own state under `$item` (kind, blank, sizes, listing, customization, mockups, cost source, offer, error). The API reads them through `dropStateOf`, `itemStateOf` and `regionsOf`, and the router returns a typed view. Note that Postgres `jsonb` reorders keys, so placements come back sorted by key, not in plan order.
8. **Durable build.** `planDrop` is keyed on the request and sends `wovain/drop.build.requested`. The `drop-build` Inngest function builds one product per step, with concurrency 1 per drop. A product that still fails after its retries is saved as failed and logged at error level, and the rest still build. Then the vision review runs and the drop moves to `in_review`.
9. **Publish through the queue.** `drops.publish` enqueues `store.drop.publish` (R2). The page sends the merchant's click as their decision. `drop-publish` listens for `approval.decided` with status approved, records executing, then done or failed, and keys every offer and the collection.
10. **Vision judge uses the existing agent.** The mockup check runs on the `design_vision` agent, so the model comes from model routing (owned by the model-routing workstream). This change adds no agent and names no model.

## Risks / Trade-offs

- **Region names and sizes are unverified.** The Fourthwall MCP answered "Sign in" during research, so sleeve and label type names come from the docs. The matcher accepts partial names, and a kind whose required pieces don't fit any blank is skipped and listed on the drop.
- **The customization pricing reply shape is unverified.** The parser accepts `totalCost`, `total`, `manufacturingCost`, `cost` or `price` per size, as a number, a string or `{amount}`. When none of them parses, the catalog fallback is used and logged.
- **The vision check sees one mockup per product**, the first Fourthwall returns, which may be the front.
- **Cutout and upscale aren't keyed.** They cost under $0.01 each and only rerun when a step retries before its upload is saved.
