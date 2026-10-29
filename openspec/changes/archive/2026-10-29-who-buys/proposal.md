# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/152

## Why

A merchant picks an idea without knowing who would buy it or where they live, and the ad step falls back to broad targeting. Judges and new merchants have no Meta connection, so the audience has to show before any connector. Expert POD practice defines the buyer (age, gender, location, lifestyle) before designing (Printify's audience guide), and Qloo's taste graph can answer all four.

## What Changes

Behind a new `who-buys` flag (on in development and next, off in production), each idea card shows "Who buys this", from Qloo alone:

- **Age and gender lean** from Qloo demographics of the idea's Qloo entities.
- **Interests**: the Qloo audiences (ranked `urn:audience` insights) whose members like the idea most, without the families an ad may not target (communities, politics, beliefs and the like).
- **Where your buyers are**: the top 5 cities Qloo ranks for the idea (`urn:entity:locality` insights within a country, the United States by default), weighed by popularity so real markets lead, with affinity bars.
- **They also buy**: the 3 fashion brands (`filter.tags=urn:tag:genre:brand:fashion`) the fans like, as targeting data, never on a design.
- Read once per idea and country and kept on the idea (`idea.who_buys`). Every value goes into the decision trace with its Qloo ID. A Qloo failure is logged at error level, and the card shows a retry: there is never a guess. The `trends-qloo` kill switch answers `QLOO_OFF`.

The heatmap (`filter.type=urn:heatmap`) is not used: it ignores `take` and returned 200 MB of boundary polygons for the United States (tried live on 2026-10-29). Ranked localities give named cities from the same signals.

## Capabilities

### New Capabilities

- `who-buys`: who buys each idea and where, from Qloo.

## Impact

- `packages/core`: `qloo.ts` gains `audiencesOf`, `placesOf` and `fashionBrandsOf` and a per-call timeout; `who-buys.ts`; the `who-buys` flag.
- `packages/db`: `idea.who_buys` (jsonb), migration `idea_who_buys`.
- `packages/api`: `ideas.whoBuys`.
- `apps/web`: `who-buys.tsx` on each idea card; en, es and fr copy.
