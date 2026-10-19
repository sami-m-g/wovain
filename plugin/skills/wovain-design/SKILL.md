---
name: wovain-design
description: Design print-on-demand products for the merchant's Fourthwall shop and publish them only after approval. Use when the merchant gives a product idea ("design a tee for …"), picks ideas from the trend card, gives feedback on a design card, or a chat message says "Approve design dN", "Feedback on design dN" or "Open design dN in Fourthwall's designer".
---

# wovain-design

One design card per idea: the merchant's design on a real Fourthwall blank, with its listing and price. Nothing is published until the merchant presses Approve on the card.

## Before any Fourthwall call

1. Fourthwall `get-instructions`, then `ecommerce_get-current-shop`, then `load-skills` with "create a product from my artwork". Follow the returned skills where they add detail; this skill decides the order and the card.
2. wovain `get_settings` for pricing and economics.

## Make the design (per idea)

1. **Blank.** Fourthwall `ecommerce_get-catalog-products` with `badges: ["OUR_PICK", "BESTSELLER"]`, `includePrintDetails: true` and the product type the idea suggests (tee by default). Prefer `supportsBackendRendering: true`, a high review score and DTG. Then `ecommerce_get-catalog-product-details` for that slug: colors, sizes (verbatim), `colorsWithStockIssues`, `printAreas` and `reviewSummary`.
2. **Artwork.** Generate the art with image generation (transparent background on): the artwork alone, no garment, no mockup, square, as large as it allows. If the merchant attached artwork instead, use theirs.
3. **Stage it.** wovain `stage_artwork`: image generation's result is a `data:image/...` URL, so pass it as `url` unchanged; an attached file goes in as `path` (or `artwork` when the chat gives a file object). Required width is the print width in inches × 150 px (12 in → 1800 px).
4. **Upload.** Fourthwall `ecommerce_request-media-upload-link` with the staged `fileName`, `contentType` and `bytes`; wovain `put_artwork` with the `artworkId` and `uploadUrl`; Fourthwall `ecommerce_save-media-library-image` with the link's `fileUrl`, `width` and `height`. Its `uri` is public.
5. **Clean it.** If the art isn't transparent, use fal on that `uri`: `recommend_model` for "remove background", run it, `stage_artwork` with fal's result `url`, and upload again (step 4). If the width is under the required width, do the same with "upscale image" (2× or 4×). Use the latest `uri` from here on.
6. **Mockups.** Fourthwall `ecommerce_generate-product-design-previews` with the region that supports backend rendering (front, large center), the `uri`, 3 to 5 in-stock colors that contrast with the artwork, and every in-stock size. Keep the `customizationId`. Fourthwall returns several renders per color; for each color pick its front render (match the `color` field, prefer the on-model style) so every mockup on the card shows the color it's labeled with.
7. **Price.** Fourthwall `ecommerce_get-customization-pricing` for the `customizationId`; wovain `price_product` with every offered size and its cost.
8. **Listing.** Title keyword first: main keyword, design element, style (≤ 120 characters). Description: 2 short on-brand lines, no garment specs (Fourthwall adds them).
9. **Card.** wovain `show_design_card` with the blank (badge in words, for example "Our pick · Bestseller"), mockups (alt text per color), colors (`inStock` false for any color with stock issues in every size), placement, artwork (`widthPx`, `requiredPx`, `transparent`, and the media library `uri` as `url`), sizes with cost and stock, listing, the quote from `price_product`, the `customizationId`, and one coach line in a friendly-coach voice that explains the call ("Soft bestseller tee, and the art prints sharp at this size."). Then stop and wait.

Every idea ends with its design card; don't stop at the artwork or ask the merchant to say "show the card". If a step fails twice, say in one line what failed and what the merchant can do.

## When the merchant acts on the card

- **"Approve design dN"**:
  1. Fourthwall `ecommerce_create-offers-from-designs` with the design's `customizationId`, title and description.
  2. `ecommerce_bulk-update-offer-variant-prices` with the card's price for every variant.
  3. `ecommerce_update-offer-status` to `PUBLIC`.
  4. wovain `record_design` with `status: "live"`, `productId` and the product's shop URL.

  If Fourthwall refuses at any step, call `record_design` with `status: "rejected"` and its reason in plain words. The card already shows Publishing and updates itself, so say one short line and nothing more.

- **"Feedback on design dN: …"**: apply the change and redo the steps it affects (new art, blank, colors, listing or price), then `show_design_card` with the same `id`. Feedback typed in the chat about a design works the same way.
- **Skip** is recorded by the card itself; don't publish skipped designs.
- **"Open design dN in Fourthwall's designer"**: Fourthwall `navigate` to the product designer for that product.

## Rules

- Never create, price or publish a product without "Approve design dN" for that design.
- Never approve a design whose card shows print quality low; regenerate larger art or use a smaller placement instead.
- Published products stay live whatever happens later in the flow.
- Leave out-of-stock sizes and colors; the card says which.
