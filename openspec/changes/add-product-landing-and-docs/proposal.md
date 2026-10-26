# Proposal

MR: !118 (`feat/product-landing-docs`). Status: in review.

## Why

The landing page and docs read like a hackathon entry. wovain is a product for independent fashion designers and small labels, print-on-demand only, and the site should say so in their language.

## What Changes

- Positioning, audience and voice in `.agents/product-marketing.md`.
- A rebuilt landing page (shadcn-studio, Magic UI and svgl blocks, themed with wovain tokens and fonts; motion respects reduced motion), with a nav link to `/pricing`.
- Docs split into a Guide tab for designers and a Developers tab for internals; old URLs still resolve; en, fr and es in sync.
- The logo renders only through `<Logo/>`, so the new mark is a one-place swap.

## Capabilities

### New Capabilities

- `marketing-site`: the public landing page, its voice and the user docs.

### Modified Capabilities

None.

## Impact

`apps/web` marketing routes and components, `apps/fumadocs` content and navigation, `.agents/product-marketing.md`. Follow-ups: SEO integration, use-case and guide pages; the timeline block's scroll fade; the fal connection copy depends on `add-fal-byo-connector`.
