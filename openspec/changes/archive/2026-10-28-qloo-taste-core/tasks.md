# Tasks

## 1. Core

- [x] 1.1 Qloo client: cross-domain affinities with explainability, bias.trends and aesthetic cues (tests first)
- [x] 1.2 Trend research: taste map on each idea, status for used, no_match, failed and off
- [x] 1.3 Design brief: aesthetic cues from the taste map, never affinity names
- [x] 1.4 Ablation eval with per-arm metrics (`src/evals/qloo-ablation.eval.ts`) and its pure metrics (tested)

## 2. API

- [x] 2.1 `qloo-taste-map` flag bypasses plan gating of `trends-qloo`; the run input takes `qloo?: boolean`
- [x] 2.2 `taste.status` procedure for the UI switch

## 3. Web

- [x] 3.1 "Use Qloo" switch on the brief step, behind the flag
- [x] 3.2 "Why this idea" panel on idea cards, with copy in en, es and fr

## 4. Docs and checks

- [x] 4.1 README "Qloo-powered" section with a redacted request and result trace
- [x] 4.2 check, check-types, knip, spec:validate and the core and api tests
