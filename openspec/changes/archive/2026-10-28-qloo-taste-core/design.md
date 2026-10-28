# Design

## Context

`packages/core/src/qloo.ts` calls `/search` and then `/v2/insights` for tags. `trends.ts` turns the tags into themes and stores each idea's research as JSON in `idea.research`. In `flow/ideas.ts`, `trends-qloo` is evaluated with the merchant's plan, so paid plans never call Qloo. A Qloo failure is logged and then dropped. Tested live on 2026-10-28: entity insights (`filter.type=urn:entity:brand|artist|movie`) with `feature.explainability=true` return `query.explainability["signal.interests.entities"]`, which lists `{entity_id, score}` per recommended entity, plus aesthetic properties (`personal_style`, `emotional_tone`, `style_description`) on brands. Tag insights return no per-tag explainability.

## Goals / Non-Goals

**Goals:**

- Make Qloo's contribution traceable on every idea, without a migration.
- Measure, offline, what Qloo changes in the themes and briefs.

**Non-Goals:**

- Qloo audiences to Meta targeting (workstream `qloo-audiences`).
- Sales-based proof that Qloo ideas sell better: there is no sales data yet.
- A graph visualisation. The panel is a structured list.

## Decisions

- **Taste map in `research` JSON.** `TrendIdea.taste?` holds the status, the seed entities, the theme's tag and the cross-domain affinities. The column is already JSONB, so no migration is needed. Old ideas have no `taste`, and the UI hides the panel for them.
- **Explainability from entity insights.** Tags carry no explainability, so the "why" comes from cross-domain entity insights (3 each of brand, artist and movie), each with per-seed-entity shares. This follows TasteCast's pattern (MIT, `src/agent/match.ts`). The theme's tag is explained by the seed entities whose fans share it.
- **Cues, not names, in the brief.** The brief gets the affinities' style, tone and keyword cues, de-duplicated and clipped. Brand and title names never reach the art model. That keeps the existing IP rules.
- **The flag decides plan gating.** With `qloo-taste-map` on, `trends-qloo` is evaluated without the plan, so it stays a kill switch only. With the flag off, nothing changes. Production keeps today's behaviour.
- **Ablation is a run input.** `qloo?: boolean` (default true) on `runs.start` flows through `RunInput` into research. The eval calls the theme step directly (Qloo's taste, then `themesFor`), so it spends no Tavily credits. Only the Qloo and Nemotron calls are live.
- **Cross-domain calls are best-effort.** If an affinity call fails, the failure is logged at error level and the tag themes are kept. If the tag call fails, the whole of Qloo counts as failed, as today.

## Risks / Trade-offs

- Each run makes 3 more Qloo calls, so research takes longer. They run in parallel with the tag call.
- Qloo's hackathon terms limit it to free and demo plans. Running it on paid plans in dev and next needs the founder's confirmation before production. The production rollout stays off.
- Eval metrics measure grounding and explainability, not quality as buyers see it.
