# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/66

## Why

Qloo shapes wovain's ideas today, but it runs only on free and demo plans, its failures are invisible, and the only trace a designer sees is one affinity number. Nobody can tell what Qloo contributed, or whether the result would differ without it. The Qloo hackathon closes on 2026-10-30, and its judges ask exactly that question.

## What Changes

- Qloo runs in every run, whatever the plan, while the `qloo-taste-map` flag is on. `trends-qloo` stays as the kill switch.
- Research also asks Qloo for cross-domain affinities: the brands, artists and films the seed's fans like. These calls use `feature.explainability` and `bias.trends`. The affinities' aesthetic cues (style, mood, tone) go into the design brief. Their names never do.
- Each idea saves a taste map: the seed entities Qloo matched, the theme's Qloo tag and affinity, and the cross-domain affinities. Each affinity records how much each seed entity contributed.
- Each idea card gets a "Why this idea" panel that shows the taste map, or says plainly that Qloo failed, found no match, or was off for the run.
- A "Use Qloo" switch on the brief step starts a run without Qloo (LLM-only themes), so the two can be compared side by side.
- An offline eval (`packages/core/src/evals/qloo-ablation.eval.ts`) runs the same seeds with Qloo and without it, and reports how well the themes are grounded and explained, how far they move from the seed and how many cross-domain cues they carry.
- The README gets a "Qloo-powered" section with a redacted request and result trace.

## Capabilities

### New Capabilities

- `qloo-taste`: how Qloo's taste graph shapes, explains and is measured in trend research.

### Modified Capabilities

## Impact

- `packages/core`: `qloo.ts` (cross-domain affinities, explainability), `trends.ts` (taste map on each idea), `design.ts` (aesthetic cues in the brief), and a new eval.
- `packages/api`: `flow/ideas.ts` (plan-free Qloo under the flag, the ablation option), the run input (`qloo?: boolean`), and a `taste.status` procedure.
- `apps/web`: the Qloo switch on the brief step, and the "Why this idea" panel on idea cards.
- Data: the taste map lives in the idea's existing `research` JSON column. No migration.
- Flag: `qloo-taste-map` (on in development and next, off in production).
