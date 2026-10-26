# Proposal

Issue: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/44 (#44). Branch: `feat/brand-shuttle`.

## Why

The founder picked the Shuttle from logo round 8. It replaces the stand-in Flick w everywhere the product, the docs and the emails show the brand.

## What Changes

- The Shuttle mark is a calico loom shuttle with long tips and a bobbin window. It rises on a 24 degree diagonal across a cochineal tile and trails a saffron thread with a soft sag. The refinement fixes round 8's "pill/capsule" read.
- The lockup pairs the mark with a Geist 600 wordmark that has a drawn w and a single-storey a.
- Variants: light, dark (tile lifted to `#be2b68`), mono and reversed.
- Icons follow the Next.js metadata file conventions: a pixel-fitted 16px favicon, a 32px favicon, `favicon.ico` (16, 32 and 48px), a full-bleed apple icon and app icon, and a maskable PWA icon listed in the manifest.
- The OG card and the email logo use the new lockup.
- `ShuttleMark` and `ShuttleLoader` use Motion (`motion/react`). They provide a one-time intro on `<Logo intro/>` and the mark as the loading state, and they respect reduced motion.
- DESIGN.md, PRODUCT.md, `.impeccable/design.json` and `.agents/product-marketing.md` are updated.

## Capabilities

### New Capabilities

- `brand-identity`: the logo, its variants, its icons and its motion.

### Modified Capabilities

None.

## Impact

Affected: `apps/web` brand files and `public/brand/`, `src/app` icons and manifest, `lib/og.tsx`, the Logo callers, and the loaders in the wizard, insights and dashboard loading. Also `apps/fumadocs` icons and lockups, and the `packages/email` logo. Trademark: a desk search (USPTO classes 9, 42 and 35, with 25 as secondary) came back "Caution, leaning Clear". EUIPO, UKIPO and WIPO still need an attorney.
