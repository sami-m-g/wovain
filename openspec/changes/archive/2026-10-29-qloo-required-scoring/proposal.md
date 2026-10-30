# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/159

## Why

Qloo is required everywhere, but scoring still had a neutral fallback: an idea with no Qloo affinity got a demand of 0.5, as if Qloo had half backed it. A Qloo tag with zero affinity could still become a theme, cost a Tavily search pair and be suggested on news alone. The `qloo-taste-map` flag is fully rolled out, and its off path is no longer worth keeping.

## What Changes

- An idea's demand is Qloo's affinity of its theme with the seed's fans, never a neutral guess. `IdeaSignals.affinity` is required.
- A Qloo tag with no affinity (0 or none) is not a theme: it is not searched and never suggested. When no tag has affinity, research stops with `QLOO_NO_MATCH` before any Tavily search.
- The feedback loop re-fits weights from Qloo-backed ideas only. An older idea saved without an affinity is left out of the fit.
- The `qloo-taste-map` flag is removed (registry, PostHog flags, `TrendSources.tasteMap`). Every run asks Qloo for cross-domain affinities and saves the taste map on each idea.

## Capabilities

### Modified Capabilities

- `qloo-taste`: the taste map is in every run with no flag; an idea needs Qloo affinity to be suggested.

## Impact

- `packages/core/src/{score,themes,trends,flag-registry,qloo}.ts`, `packages/api/src/flow/{ideas,feedback}.ts`, `infra/posthog/flags.json` (Pulumi deletes the PostHog flag on the next apply).
- Autopilot's niche suggestions start a run whose research follows the same rule, so every idea they lead to is Qloo-backed.
