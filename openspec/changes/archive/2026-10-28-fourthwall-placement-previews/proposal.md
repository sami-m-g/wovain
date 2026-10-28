# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/18

## Why

On the design approval step, "On a shirt" drew a neutral SVG tee in page colours with the art pasted on it. The merchant approved a guess, not what the shop would sell. Fourthwall renders the real placement (`ecommerce_generate-product-design-previews`), but wovain only called it when it made the product.

## What Changes

- Once a design's artwork exists, the run renders Fourthwall's placement preview on the blank the product path picks (`pickBlank`, its front print region) and saves the mockup URLs on the design (`design.mockups`, `design.mockup_status`).
- "On a shirt" shows Fourthwall's mockup. "Flat art" shows the raw art.
- A preview that fails (or returns no mockups) is logged at error level, so it reaches Error Tracking, and the card shows the flat art with a notice. Without a working Fourthwall connection nothing is called and the card asks the merchant to connect Fourthwall. The design itself never fails on its preview.
- The upload and the render are keyed writes, so a retried step renders once.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-generation`: a design has Fourthwall's placement preview.

## Impact

- `packages/db`: two columns on `design`, an additive migration.
- `packages/api`: `flow/placements.ts`, called at the end of `generateDesign`.
- `apps/web`: `DesignPreview` and its messages in en, es and fr.
