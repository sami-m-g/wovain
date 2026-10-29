# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/120

## Why

The user decided that a brand's voice and palette are defaults, not rules: a newcomer can skip them, and each drop should adapt them to its own buyers. A cosy plant drop and a gothic romance drop from the same label shouldn't share one tone and one palette. Today the brief writer and the ad writer get no tone or palette at all, and nothing checks that the art colours read on the shirt colours the blank comes in.

## What Changes

Behind a new `drop-style` flag (on in development and next, off in production):

- **A style per drop.** For each idea (a drop's theme with its Qloo audience), a `drop_style` agent (default job, Zod-checked) suggests 3 tones (a label and an example listing line) and 3 palettes. It starts from the brand's voice and colours and adapts them to the idea's Qloo cues. Code holds every palette to the blank's real colours with ink contrast of at least 3:1 (`garment-colors.ts` from #113). The style is saved on the idea (`idea.style`, a new jsonb column) and recorded in the decision trace (`drop.style`).
- **Picked, not typed.** The new-drop flow shows a "This drop's tone and colours" panel on each picked idea: tones as example lines and colours as swatch sets on the shirt colours, each with an info tooltip. The merchant picks one of each (`ideas.pickStyle`, recorded as `drop.style.pick`); only suggested palettes can be picked.
- **Used by the writers.** `draftBrief` gets the drop's tone, its ink colours and its garments (listed first in `garmentColors`). `writeAdCopy` gets the tone. Both get the brand voice as guardrails they must not break. A failed suggestion is logged at error level and the drop goes on without a style.
- **Re-checked on another blank.** `refitStyle` re-fits the palettes to another blank's colours and keeps the pick when it still fits.

## Capabilities

### New Capabilities

- `drop-style`: each drop's own tone and palette, how they are suggested, picked and used, and the brand voice as guardrails.

## Impact

- `packages/core`: `drop-style.ts`; `design.ts` and `ads.ts` take a style; a `drop_style` agent; the `drop-style` flag.
- `packages/db`: `idea.style` with its migration.
- `packages/api`: `ideas.style`, `ideas.pickStyle`; the design and campaign steps read the style.
- `apps/web`: the panel in the ideas step; en, es and fr copy.
