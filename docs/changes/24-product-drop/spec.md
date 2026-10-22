# Spec: Turn one idea into a priced multi-product drop on Fourthwall

Intent: [intent.md](intent.md)

## Requirements

1. A design can carry a range of up to 7 more products besides its hero product. Each product has its blank, a main placement with its artwork, up to 4 extra placements each with its own artwork, colors, mockups, sizes with cost, listing and quote.
2. `show_design_widget` prices every product on the server from its offered sizes' costs with `priceProduct` and the merchant's settings. The agent can't pass a price.
3. The widget shows the hero as today, each extra placement, a card per range product (mockup, type, placements, price, profit, margin) and the drop's totals. Approve is disabled while any print in the drop is low quality.
4. `generate_art` generates up to 8 art pieces (hero, back print, sleeve mark, pocket logo…) on the merchant's fal account, transparent PNG at print size, optionally referencing earlier art so the drop stays coherent.
5. `publish_design` runs only on a design the merchant approved on the widget (status `publishing`). It creates the products from their customizations, sets each price, publishes them, and groups a drop into one Fourthwall collection. It saves offer ids as soon as they exist, so Try again never makes duplicates. A refusal records the design as rejected with Fourthwall's reason.
6. The design playbook plans the drop from the catalog, renders every product's mockups in one Fourthwall call and uses wovain's `fourthwall` tool for every read.
7. Stored designs without a range still read (the new fields default to empty).

## Design

Fourthwall tools checked (tool descriptions from its MCP, first-party):

- `generate-product-design-previews` takes several products per call and several regions per product (`regionNames`, `regionUrls`, `placementIds`, `fillAllPlacements` for both mug sides or every sticker slot, `regionFractions`). It returns one `customizationId` per product. So one call renders the whole drop with every placement; `add-design-region` (one region at a time on an existing customization) isn't needed.
- `create-offers-from-designs` takes many `customizationIds` with names and descriptions and creates the offers HIDDEN.
- `bulk-update-offer-variant-prices` sets one uniform price, `update-offer-status` makes an offer PUBLIC, `get-offers-by-ids` returns slugs.
- `create-collection` groups offers (created HIDDEN); `update-collection-state` makes it PUBLIC.
- `create-combined-listing` merges color variants of one product library only, so it can't hold a tee and a mug. `create-bundle` sells offers together at one price; left for later.
- `get-customization-pricing` gives per-size manufacturing cost per customization.

fal: `openai/gpt-image-2.5/flare/text-to-image` takes `background: "transparent"`; its `/edit` route takes `image_urls` as references. Both accept explicit sizes up to 3840 px a side and 8.29 MP. Shapes: square 2880×2880 (19.2 in at 150 DPI), portrait 2400×3200, wide 3840×1920 (mug wraps, sleeve wordmarks).

Shapes and helpers:

- `packages/shared/src/design.ts`: `productSchema` (the fields every product has), `rangeProductSchema` (plus `kind` and `offerId`), `designSchema` (hero product plus coach, idea, status, `range`, `dropName`, `collectionId`). `lowPrints(design)` lists every low-quality print in the drop; `dropTotals(design)` sums price and profit for one of each product.
- `apps/server/src/lib/art-plan.ts`: one fal request per art piece.
- `apps/server/src/lib/publish-design.ts`: the publish sequence over an injected `call(tool, args)`, and `replyData` that reads a tool result's structured content or its JSON text. Reads ids and slugs out of Fourthwall's replies with zod, nothing else.
- `apps/server/src/tools/design.ts`: `show_design_widget` prices; `publish_design` wraps `upstream.call` for the merchant's Fourthwall and records the result.
- `apps/server/src/tools/art.ts`: `generate_art` (fal `submit_jobs`, like `generate_videos`).
- The widget's Approve keeps posting "Approve design dN"; the playbook then screens trademarks and calls `publish_design`.

## Areas of concern

- **Publishing without approval.** `publish_design` refuses unless the design is `publishing`, which the widget's Approve sets. The proxy `fourthwall` tool still has no write tools.
- **Duplicate products on retry.** Offer ids are saved right after creation; a retry only creates the missing ones. A redraw keeps a product's offer id while its customization is unchanged.
- **Untrusted replies.** Fourthwall replies are parsed for ids, slugs and the shop URL with zod; refusal text goes to the widget as plain text, cut to 200 characters.
- **Money.** `generate_art` spends the merchant's fal credits; the playbook says the estimate first, as `generate_videos` does.
- **Record shape.** New fields are optional or default to empty, so old records still parse; ads keep reading the hero's quote and mockups.
