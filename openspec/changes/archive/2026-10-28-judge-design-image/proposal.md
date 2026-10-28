# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/22

## Why

A design whose art is a picture of a pink T-shirt reached the merchant for approval. The in-run judge (`judgeDesign`) reads only the text brief, has no garment rule and never sees the image; it said `revise` (score 80), and the design was still shown like any other. The `design_quality` judge has a garment rule but only runs as a sampled background scorer. Dark art (a black cat, a navy ornament) was also drawn for briefs that listed black and navy garments, and nothing checked that the art shows on them.

## What Changes

- A vision check reads the drawn artwork PNG (Nemotron 3.5 Super VL on Nebius Token Factory, the existing key) and checks: the subject is not a garment, mockup or clothing; there is no background and nothing is cropped; the readable printed text matches the brief; and the art shows on each listed garment color.
- Garment colors the art disappears on are dropped from the brief; when none is left, the design fails.
- The brief check gains a `garment` rule, and the brief writer is told never to make a garment the subject and to list only colors that contrast with the art.
- A design the judge marks `revise` is redrawn once (a new brief from the judge's fixes, new art), without charging the merchant again. If the redraw is still `revise`, it is saved and shown flagged: the card names the failed checks and the approve button reads "Approve anyway".
- The pink-tee case is a labeled fail in `judges.v1.json` and in tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-generation`: the judged design is judged on its image too, with a garment rule and per-color contrast.
- `runs-and-approval`: a `revise` design is redrawn once, then shown flagged.

## Impact

`packages/core` (`design.ts`, `agents.ts`, `nemotron.ts`, `judges.ts`, eval set, tests), `packages/api/src/flow/designs.ts` (redraw once), `apps/web` design card and messages. No schema migration: the judgment is JSON on the design row.
