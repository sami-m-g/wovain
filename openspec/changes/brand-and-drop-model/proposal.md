# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/133

## Why

The user wants to make money, and wants wovain to keep it simple: suggest what to sell, even if it is completely different every time, unless they choose to set up a concrete brand. Today the brand comes first: onboarding asks for one, autopilot only scans merchants with a `brand_profile` row, and ideas start from a seed the merchant types. This change writes down a model where selling comes first and the brand is optional.

## What Changes

Spec only. No app code, schema or migration changes in this change.

- **"Just sell" is the default.** No brand needed. wovain suggests what will sell now from trends (Qloo, Tavily and the competition read), in any niche, possibly different every drop, ranked for sales.
- **The brand is optional.** If the merchant sets one (niche, audience, references, voice, palette, preferred blanks), suggestions stay within it and each drop's fields start from it.
- **A drop is suggested (the default) or manual** (the merchant gives the direction).
- **Any drop field can be overridden on that drop,** without changing the brand.
- **Nothing requires a brand:** onboarding, drops, autopilot and ads all work without one.
- `design.md` keeps the research on how real brands and print-on-demand sellers handle drops and audiences as background, for features that may come later.

## Capabilities

### New Capabilities

- `brand-and-drop`: "Just sell" by default, the optional brand, suggested and manual drops, and per-drop overrides.

## Impact

- Follow-up changes: the onboarding brand step (`apps/web` onboarding wizard, `packages/mastra/src/mastra/flow/onboarding.ts`), idea research (`packages/core/src/trends.ts`, `ideas.research`), autopilot (`packages/mastra/src/mastra/flow/autopilot.ts`), ad targeting (`packages/mastra/src/mastra/flow/audience.ts`), `drop` fields in `packages/db`, and `drop-style.ts` from #122. The gaps are in `tasks.md`.
- Builds on #113 (brand discovery) and #122 (drop style).
