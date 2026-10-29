# Tasks

Issue #159.

## 1. Scoring needs Qloo

- [x] 1.1 `IdeaSignals.affinity` is required, and `scoreFeatures` reads demand from it with no neutral fallback
- [x] 1.2 `qlooThemes` drops tags with no affinity; `ideaOf` returns no idea without one
- [x] 1.3 The feedback fit reads only signals with an affinity

## 2. Retire `qloo-taste-map`

- [x] 2.1 Remove the flag from the registry and `infra/posthog/flags.json`
- [x] 2.2 Remove `TrendSources.tasteMap`: research always asks for cross-domain affinities and saves the taste map
- [x] 2.3 Docs stop naming the flag

## 3. Tests

- [x] 3.1 Research suggests no idea without Qloo affinity, and stops with `QLOO_NO_MATCH` when no tag has one
- [x] 3.2 `researchSourcesFor` evaluates `trends-tavily` and `tavily-evidence` only
