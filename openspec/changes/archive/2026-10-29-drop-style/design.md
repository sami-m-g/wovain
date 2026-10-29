# Design

## Context

#113 added guided brand discovery, `garment-colors.ts` (the blank's known colours and WCAG contrast) and `draftBlank` (the merchant's most popular renderable tee and its colours, cached a day). Ideas carry their Qloo audience in `research.taste` (affinities with style and mood cues). The brief is written in `generateDesign` and the ad copy in `createCampaign`.

## Decisions

- **Saved on the idea.** An idea is one drop's theme with its own Qloo audience, and both writers already read the idea. `idea.style` is nullable: it's suggested the first time it's asked for (by the panel or by the design step), then kept.
- **The model proposes, code enforces.** The `drop_style` agent sees only the brand's voice and colours, the idea's theme and its Qloo cues, the garment names the blank offers and the language. Every palette goes through `fitPalette`; one that can't be made readable is left out.
- **Guardrails, not voice.** The brand voice is passed whole as `guardrails`. The prompts tell the writers to write in the drop's tone and never break what the guardrails rule out. Grounding is unchanged: the style is in the prompt, so its words don't trip the grounding guard.
- **Picks are indexes.** `pickStyle` takes the index of a suggested tone and palette (or the merchant's own tone line), so a saved palette has always passed the contrast check.
- **Failures don't block a drop.** A failed suggestion is logged at error level (`DROP_STYLE_FAILED`), and the brief and ads are written without a style, as before.

## Non-Goals

- Re-checking each Fourthwall blank chosen inside a multi-product drop (design-drops). `refitStyle` is ready for that step; wiring it in is a follow-up.
