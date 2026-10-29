# Design

## Context

The brand step saves `brand_profile` with the niche, the taste references resolved to Qloo entities (`qloo_entities`) and the demographics; the merchant can skip it. The brand-discovery engine (`packages/core/src/brand-discovery.ts`) already has the apparel-safe Qloo audiences (`seedsOf`), Tavily momentum (`momentumOf`), saturation (`readSaturation` in `competition.ts`) and the ranking (`scoreOf`), with Qloo calls capped at 4 in flight and retried (`qloo.ts`). The new-drop flow's first step is `BriefStep`; a run's seed is at most 200 characters.

## Goals / Non-Goals

**Goals:** the first screen of a drop shows what to sell now, with evidence, with or without a brand; one click starts the drop; different brands see different directions; "Show me others" changes the niches.

**Non-Goals:** saving directions; charging credits for them; replacing the run's own research (the run still researches the chosen brief); autopilot without a brand (a separate gap in #134).

## Decisions

- **Open mode, one audience per direction.** Five Qloo audiences, shuffled by a hash of the user and the round (`seedsOf`), so two merchants and two rounds see different ones. Per audience: insights for artists and TV shows with `bias.trends=high`, then `tagsFor` the top 4 rising entities together; the direction is the strongest tag no other direction took. About 15 Qloo calls.
- **Brand mode.** Two insights calls (artist, TV show) with the brand's entities, its strongest age bucket and a single gender as signals, `bias.trends=high`, the brand's own entities left out. The six strongest rising entities each get `tagsFor`; tags are grouped across entities and weighed by entity affinity x tag affinity; a tag equal to a brand niche is dropped. A brand with no Qloo entity counts as no brand.
- **No brands as entities.** Qloo's brands for these signals came back as charities and medical associations (tried live on 2026-10-29), as in brand discovery.
- **Ranking in code.** Brand discovery's `scoreOf`: Qloo affinity (mean of up to 3 carriers) x momentum (0.4 + 0.6 x min(hits/6, 1)) x saturation (low 1, medium 0.7, high 0.35); an unmeasured factor counts 0.6.
- **Words.** One Nemotron call for all directions. The model is told to name no artist, show or brand in the brief and to state only the facts given in "why now". A failed call is logged and the direction keeps its tag as the title and a plain brief; the UI then builds "why now" from the counts.
- **Failure rules.** All Qloo calls failing throws `DISCOVERY_QLOO_FAILED` before any Tavily or Nemotron call. One call failing is logged and the rest are used. Tavily failing leaves momentum or saturation unknown and the card says so. Every failure is logged at error level through evlog.
- **Trace and limit.** One `DecisionTrace` per request inside `withLlmTrace` (agent `drop_directions`, steps `directions.qloo` with the scope, and `directions.rank`); the hourly limit counts `directions.qloo` rows. The client caches each answer for the session, keyed by `ignoreBrand` and `round`.

## Risks / Trade-offs

- An open set takes about 20 to 30 s live (Qloo's rate limit and two Tavily searches per direction); the step shows skeletons and the brief stays usable meanwhile.
- Qloo's audience tags can be broad ("Soundtrack"); the evidence line shows the audience and the rising names so the merchant can judge.
