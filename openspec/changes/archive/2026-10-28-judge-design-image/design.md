## Context

`judgeDesign` (`packages/core/src/design.ts`) sends the brief, the idea and code's print-size fact to Nemotron 3 Super, a text-only model. Nothing reads the PNG fal draws, so a brief whose subject is a garment, or art that vanishes on the listed garment colors, passes into approval. `generateDesign` (`packages/api/src/flow/designs.ts`) saves the design whatever the verdict; only autopilot refuses `revise`.

## Goals / Non-Goals

**Goals:** judge the image; fail garments, backgrounds, crops, wrong text and invisible-on-garment art; redraw a `revise` design once; flag what still fails.

**Non-Goals:** Fourthwall placement previews, the approve "already decided" error and gating generation on user action (other changes). No new provider key.

## Decisions

- **Model: `nvidia/Nemotron-3.5-Super-VL` on Nebius Token Factory.** It uses the `NEBIUS_API_KEY` wovain already has, costs the same as today's Nemotron 3 Super ($0.30 / $0.90 per 1M tokens), keeps the Nemotron family, and is Nebius's named replacement for `nvidia/nemotron-3-super-120b-a12b`, which leaves Serverless on November 9, 2026. Qwen2.5-VL-72B was removed in the August 2026 deprecation, and MiniCPM-V 4.5 leaves on November 9 too. OpenRouter has no key in the project; fal vision would bill the merchant's own fal account for wovain's quality check.
- **A separate agent, `design_vision`.** It runs on the vision model with its own PostHog span, and the text judge keeps its model. `ask` takes optional image URLs and sends them as image parts.
- **Nebius fetches the image.** The vision model declares https image URLs as supported, so the AI SDK passes fal's URL through instead of downloading and inlining a 2880 px PNG. A fetch failure is an HTTP error from Nebius and fails the step, which retries; Mastra's own download path would replace an unreachable image with a placeholder and only warn.
- **Vision checks are facts.** Like print size, `garment`, `background`, `printed_text` and `contrast` come from the vision answer and override the text model's word on those rules. Code drops the colors the vision model says the art disappears on and fails `contrast` when none is left.
- **Garment rule in the brief check** catches the case before art is even read (the text judge sees the art prompt), and the brief writer is told not to make a garment the subject and to pick colors that contrast with the art.
- **Redraw once, uncharged.** On `revise`, `generateDesign` drafts a second brief with the first judgment's failed checks and fixes, draws it and judges it, each step keyed for idempotent retries. The design credit was charged for the first drawing; the redraw is wovain's quality cost. The redraw's fal request runs on the merchant's own fal account like the first.
- **Flag in the UI.** A `revise` card shows a warning with the failed checks' notes and labels approve "Approve anyway". Autopilot already never approves `revise`.

## Risks / Trade-offs

- Whether Nemotron 3.5 Super VL honors `json_schema` structured output on Nebius was not verified with a live key. If it doesn't, the call fails loudly (schema parse error reaches PostHog) rather than passing a design.
- The redraw doubles model and fal cost for failing designs; it runs at most once.
- A vision model can misjudge contrast on thin line art. Dropping a color is reversible by the merchant; failing only when no color is left keeps false fails rare.
