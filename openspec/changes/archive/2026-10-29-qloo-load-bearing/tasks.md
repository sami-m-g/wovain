# Tasks

Issue #107.

## 1. Research needs Qloo

- [x] 1.1 `createTrends` takes no model: themes are `qlooThemes` (Qloo's tags only, at most 3); the brief top-up and design angles are gone from `themes.ts`
- [x] 1.2 No usable Qloo tag throws `QLOO_NO_MATCH` (422) before any Tavily search; a failed Qloo call throws instead of being caught
- [x] 1.3 `QlooStatus`, `TrendSources.qloo`, `TrendResearch.qloo` and `TasteMap.status` removed
- [x] 1.4 The ablation's LLM-only arm moves to `evals/llm-themes.ts`

## 2. No opt-out

- [x] 2.1 `runs.start` loses its `qloo` input; `run.qloo` dropped with a generated migration; `ideas.tasteMap` removed
- [x] 2.2 `assertQlooOn` refuses `runs.start` (before the run is saved) and research with `QLOO_OFF` while `trends-qloo` is off
- [x] 2.3 `researchErrors` declared on `runs.start` and `ideas.research`; `QLOO_NO_MATCH` re-thrown as a typed oRPC error, credits released
- [x] 2.4 The feedback loop passes only the weights to research

## 3. Web

- [x] 3.1 The brief step's Qloo switch removed
- [x] 3.2 A failed run with `QLOO_NO_MATCH` shows a suggestion panel: name a band, film, brand or place, example briefs, "Write a new brief"
- [x] 3.3 The taste map panel shows nothing for an idea with no Qloo entity (ideas saved before this change)

## 4. Docs and checks

- [x] 4.1 README demo path and "Why wovain needs Qloo"; docs site pages in en, es and fr
- [x] 4.2 Tests: core research, themes, ideas, startRun and research refusals, failure panel, taste map
- [x] 4.3 `pnpm run check`, `check-types`, `knip`, `spec:validate`
