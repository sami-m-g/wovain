# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/133

## Why

A merchant has one `brand_profile` row: a niche, taste references, Qloo entities, demographics, a free-text voice and a palette. Since #122 each idea also gets its own tone and palette (`drop-style` flag, `idea.style` column). Nothing says what the brand is for, how a drop starts, or which brand values a drop may change. This change writes down a simple model, so the next implementation changes build to it.

## What Changes

Spec only. No app code, schema or migration changes in this change.

- **The brand is the defaults a drop needs:** niche and audience, references, voice, palette, preferred blanks, and price floor and margin. Nothing more.
- **A drop starts manual or suggested.** Manual: the merchant gives the direction. Suggested: wovain proposes it from the brand plus current trends from Qloo and Tavily.
- **Every drop field starts from the brand default,** and the merchant can override any of them on that drop without changing the brand.
- `design.md` keeps the research on how real brands and print-on-demand sellers handle drops and audiences as background, for features that may come later.

## Capabilities

### New Capabilities

- `brand-and-drop`: the brand as drop defaults, manual and suggested drops, and per-drop overrides.

## Impact

- Follow-up changes: `packages/db` (`brand_profile` and `drop` fields), `packages/core` (`brand-identity.ts`, `brand-discovery.ts`, `trends.ts`, `pricing.ts`, `drop-style.ts` from #122), `packages/api` (`flow/drops.ts`, idea research) and the `apps/web` new-drop flow. The gaps are in `tasks.md`.
- Builds on #113 (brand discovery) and #122 (drop style).
