# Design

## Context

Each idea carries its Qloo data in `idea.research`: the taste map's seed entities and cross-domain affinities (`taste`), and its Qloo tag (`qlooTag`). The Qloo client (`packages/core/src/qloo.ts`) caps requests at 4 in flight and retries 429 and 5xx. Brand discovery already turns Qloo demographics into an age band and a gender lean (`buyersOf`).

## Decisions

- **Signals.** The idea's taste-map seeds, then its strongest affinities, up to 5 entities, plus its Qloo tag (`signal.interests.tags`). A tag-only idea gets no demographics (Qloo's demographics take entities only). An idea with neither answers `WHO_BUYS_NO_SIGNAL` (422).
- **Four Qloo calls in parallel:** demographics, ranked audiences (`filter.type=urn:audience`), ranked localities (`filter.type=urn:entity:locality` with `filter.location.query`) and fashion brands (`filter.type=urn:entity:brand`, `filter.tags=urn:tag:genre:brand:fashion`). They were probed live on 2026-10-29. Localities need a location ("World" answers 400) and take about 20 to 25 s, so that call waits up to 60 s; the others keep the 15 s timeout.
- **Ranking.** Audiences: Qloo's order, without the families an ad may not target (Meta removed detailed targeting on sensitive topics in January 2022). Places: 15 asked for, ranked by affinity x popularity, top 5 kept, since affinity alone ranked villages at the top.
- **Default country: United States.** It is where most POD stores sell (72.5% of Shopify stores on Printful's app, StoreLeads, November 2024). The API takes another country.
- **Cache.** Kept on the idea per country; asking for another country reads Qloo again.
- **Failure.** Any Qloo call failing is logged at error level (`WHO_BUYS_STEP_FAILED`) and answers `WHO_BUYS_QLOO_FAILED` (502); the card shows a retry. Nothing is filled in without Qloo.
- **Trace.** One `who.buys` entry per read (agent `who_buys`), with every audience, place and brand as a Qloo source.
- **Not the heatmap.** It ignores `take` and sent 200 MB of polygons for the United States.

## Risks / Trade-offs

- About 20 to 25 s for the first read of an idea, on the hackathon server; the card loads on its own and the rest of the idea is usable meanwhile.
- Qloo's locality names are sometimes counties ("Los Angeles County"); they are shown as Qloo names them.
