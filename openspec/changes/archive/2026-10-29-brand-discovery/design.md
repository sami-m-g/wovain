# Design

## Context

The brand step (`apps/web/src/components/app/onboarding-brand.tsx`) saves `brand_profile` through `onboarding.saveBrand`, which resolves references with Qloo `/search` and cultural proxies (`packages/core/src/brand-identity.ts`). The Qloo client (`packages/core/src/qloo.ts`) already reads tags, demographics and cross-domain insights. The apparel-safe Qloo audiences are listed in `qloo-audiences.ts`. The competition read (`competition.ts`, #108) counts near-identical marketplace listings.

## Goals / Non-Goals

**Goals:** a newcomer leaves the step with a niche, references, a voice and colours they understand, chosen from evidence Qloo decided; nothing on screen in design jargon; under about 20 s.

**Non-Goals:** per-drop tone and palette (follow-up); storing garment colours on the brand profile; charging credits in onboarding.

## Decisions

- **One Qloo input per card.** Suggest for me uses six Qloo audiences, shuffled by a hash of the user and the round, so "Show me others" gives a new set and two merchants see different ones. The questionnaire makes one input per chosen audience (with the loves, age and gender as signals) and one per love. Different inputs give different references, and code never lets two cards share a reference, a niche or a palette.
- **Demographics alone are not a signal.** The hackathon server answers 400 to insights with only an age or gender, so a query always carries an audience or entities (tried live on 2026-10-28 and 2026-10-29). Audiences alone use `bias.trends=high`; inputs with the merchant's loves use `medium`.
- **References.** Artists and TV shows (brands with audience signals came back as banks and charities), interleaved, specific before global: entities at Qloo popularity above 0.995 (global pop stars) are used only when nothing more specific is left. 3 to 4 per card; fewer than 3 drops the card.
- **Ranking in code.** Qloo affinity (mean affinity x (0.5 + 0.5 x mean popularity)) x momentum (0.4 + 0.6 x min(hits/6, 1)) x saturation (low 1, medium 0.7, high 0.35); an unmeasured factor counts 0.6, so a card with evidence outranks one without.
- **Words from the model, one call per card.** One call for five cards ran past the output limit and took 25 s; five parallel calls take about 8 to 12 s. The schema caps every string. The "why" line is told never to state a number; the numbers on the card come from code (taste match, recent stories with links, similar listings).
- **Palettes held to the blank.** Fourthwall's catalog names colours without hex, so `garment-colors.ts` keeps hex values for the names Fourthwall's colour filter and the popular blanks use; a name it doesn't know is never offered. Contrast is WCAG 2's ratio, `MIN_INK_CONTRAST = 3`. A failing ink is shifted toward white or black in steps until it passes on every chosen garment, else dropped; fewer than 2 inks drops the palette. The blank is the merchant's most popular renderable tee, read through their Fourthwall connection and cached a day; with no connection the palettes fit Black, White, Natural and Heather Grey and the card says so.
- **Failure rules.** Every Qloo input failing throws `DISCOVERY_QLOO_FAILED` (502) and the UI shows a retry. One input failing drops that card. Tavily failing leaves momentum or saturation unknown and says so. Each failure is logged at error level through evlog.
- **Trace.** Discovery runs in its own `DecisionTrace` (user scope, agent `brand_discovery`) inside `withLlmTrace`, so Nemotron calls and the competition search record next to the Qloo steps. The hourly limit counts `discovery.start` rows.
- **Credits.** Free in onboarding: a Free plan's credits go to the first drop. The cost is bounded by the hourly limit.

## Risks / Trade-offs

- Qloo's hackathon data is noisy for audiences alone; the popularity rule and the ranking keep the cards specific, and the questionnaire with the merchant's loves gives sharper references.
- The garment colour table is hand-kept; an unknown name is skipped, never guessed.
