# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/107

## Why

The Qloo hackathon judges by one rule: "if it works the same without Qloo, wrong thing". Today a run still finishes without Qloo. The wizard has a "Use Qloo taste data" switch that sends `qloo: false` to `runs.start`. When Qloo is off, fails or names fewer than 3 themes, research tops the themes up from the brief: the `research_themes` agent splits the brief, and design angles stand in when no model answers. The README's demo path even tells judges to try a run without Qloo.

## What Changes

- **BREAKING** The merchant-facing switch is gone: the wizard's "Use Qloo taste data" toggle, the `qloo` input of `runs.start`, the `run.qloo` column (dropped by a migration) and the `ideas.tasteMap` procedure that showed the toggle.
- `trends-qloo` is an ops kill switch only. While it is off, `runs.start` and `ideas.research` refuse with the typed error `QLOO_OFF` (503). No run starts and no degraded run happens.
- Every idea is a Qloo taste tag. Research takes up to 3 of Qloo's tags for the brief's entities and nothing else. The top-up from the brief and the design angles are removed from the product.
- When Qloo matches nothing in the brief, research stops with `QLOO_NO_MATCH` (422): "Qloo found no audience for this brief; try naming a band, film, brand or place". The credits are given back. The wizard shows a suggestion panel with example briefs Qloo knows and "Write a new brief", not "Try again".
- When a Qloo call fails, the research step fails (retried, then the run fails and is logged at error level). It never falls back to ideas without Qloo.
- Tavily only adds evidence (news, listings, prices, dossiers) to Qloo's themes. It never names a theme.
- The feedback loop no longer passes what sold to a theme prompt: themes come from Qloo alone. It still re-fits the score weights and writes the learnings to working memory.
- The with-Qloo vs LLM-only ablation stays an offline eval. Its LLM-only arm moves to `packages/core/src/evals/llm-themes.ts`, used by no product path.
- The README's demo path step 6 and "What breaks without Qloo" become "Why wovain needs Qloo": what each Qloo call decides. The docs pages follow.

## Capabilities

### Modified Capabilities

- `qloo-taste`: Qloo is required in every run; no merchant opt-out; no match and failures stop the run with typed errors; the comparison is an offline eval only.
- `design-generation`: research themes are Qloo's tags only, never topped up from the brief.
- `feedback-loop`: learnings no longer go to a theme prompt.

## Impact

- `packages/core`: `trends.ts` (no fallback, `QLOO_NO_MATCH`), `themes.ts` (`qlooThemes`), `log.ts` (`qlooNoMatch`), `design.ts`, `core.ts`, `evals/` (LLM-only arm), `flag-registry.ts` (the `trends-qloo` description)
- `packages/api`: `flow/ideas.ts` (`QLOO_OFF`, `QLOO_NO_MATCH`, `assertQlooOn`), `flow/runs.ts`, `flow/feedback.ts`, `routers/seller.ts`, `workflows/run.ts`
- `packages/db`: `run.qloo` dropped (`20261029073440_drop_run_qloo_choice`)
- `apps/web`: the brief step, the run failure panel, the taste map panel, messages in en, es and fr
- `infra/posthog/flags.json`: the `trends-qloo` description only. No rollout value changes.
- README and the docs site
