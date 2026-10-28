# Tasks

## 1. Variants

- [x] 1.1 Pass the brief's colors (matched to the blank's) and every size to single-design previews, behind `design-drops`
- [x] 1.2 Key the preview apart from one without variants

## 2. Placement plans

- [x] 2.1 Product kinds with pieces (art type, region, placement, fraction, offset) and print sizes
- [x] 2.2 Resolve pieces against real print areas: no colliding areas, unknown placements dropped, required areas covered

## 3. Art pipeline

- [x] 3.1 fal requests per art type, with model IDs from `FAL_IMAGE_MODEL` and `FAL_ART_MODELS`
- [x] 3.2 Rasterize SVG, tile patterns, fit raster art, harden alpha (sharp)
- [x] 3.3 Snap embroidery to at most 6 palette colors
- [x] 3.4 BiRefNet for raster art without alpha, an upscaler below the method's DPI
- [x] 3.5 `FAL_ART_MODELS` in `.env.schema`, Pulumi config (prod, dev, next), CI and `turbo.json`

## 4. Drops

- [x] 4.1 Style family from Qloo tags and brand niches, mix from the family, traced
- [x] 4.2 Drop brief (Nemotron) and blanks with colors and sizes per kind
- [x] 4.3 Build each product: shared art drawn once, placed, uploaded, previewed and priced
- [x] 4.4 `drop-build` Inngest function, one product per step, failures saved and logged
- [x] 4.5 Publish through one `store.drop.publish` approval and the `drop-publish` executor

## 5. Checks

- [x] 5.1 Code facts per placement: DPI, aspect, transparency, slab, thread colors
- [x] 5.2 Vision check of the mockups: placement fit, hierarchy, cohesion

## 6. Price

- [x] 6.1 Price from Fourthwall's customization cost; catalog fallback logged at error level

## 7. UI

- [x] 7.1 `/dashboard/drops`: plan from an idea, products with every mockup, placements, colors, sizes, price, checks, publish
- [x] 7.2 Sidebar item while the flag is on; messages in en, es and fr

## 8. Tests

- [x] 8.1 Core: style family, mixes, placement plans, colors, prices, fal requests, rasterizing, facts, Fourthwall replies
- [x] 8.2 Flow: a drop planned from Qloo tags, built, reviewed and published against PGlite and fake providers
- [x] 8.3 Variants passed to a single-design preview with the flag on
