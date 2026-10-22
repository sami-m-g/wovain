# Spec: Qloo taste signals drive trend research and Meta targeting

Intent: [intent.md](intent.md)

## Requirements

1. Without `QLOO_API_KEY`, `research_trends` behaves exactly as before and its result says `qloo: "not_configured"`.
2. With the key, `research_trends` calls Qloo `/search` (the seed, 3 results), then `/v2/insights` (`filter.type=urn:tag`, the found entity IDs, 10 tags) and `/v2/trending` (the first entity, its type, the past 28 days), on `https://hackathon.api.qloo.com` with `X-Api-Key`.
3. The 3 tags with the highest affinity become themes. Per theme, Tavily runs one news search (past week) and one marketplace search restricted to etsy.com, redbubble.com and amazon.com: 6 basic searches, 6 credits.
4. Each idea's score is computed in code from fixed, exported weights. The idea returns its inputs: `affinity`, `newsHits`, `marketHits`, `velocity` (when Qloo returned one) and `activeAds` (when the agent passed one).
5. Each idea carries `theme`, `taste` ("Qloo affinity …"), `moment` (a headline from this week, when there is one), `tags` (Qloo tag IDs for `suggest_audience`), up to 3 `competitors` (title, link, a price seen in the snippet) and its sources.
6. Nemotron, when there's a Nebius key, writes only `idea`, `angle` and `why` per theme. It never sees or changes the score. An idea or angle that names an entity Qloo returned (a brand, artist or title) is replaced by the plain theme name.
7. If Qloo fails or finds nothing, `research_trends` falls back to today's path and says `qloo: "failed"` or `"no_match"`. A failed `/v2/trending` call only leaves `velocity` out.
8. `research_trends` takes an optional `adCounts` (up to 5 `{ theme, activeAds }`), which boosts demand for the matching theme.
9. `suggest_audience` takes 1 to 3 Qloo tag IDs and an optional place (default "United States"), calls `/v2/insights` twice (`urn:demographics`, `urn:heatmap`) and returns age bands, gender and up to 5 locations (latitude, longitude, affinity). Without the key it returns `configured: false`.
10. Every Qloo result is marked untrusted in the tool text, the structured result and the prompt. Errors are logged by class only.

## Design

### Taste × moment

Qloo and Tavily answer different questions, so each owns one part of the idea.

- **Qloo is who, and what they love.** Taste moves slowly. From the seed, Qloo finds the audience's cross-domain affinity graph: the genres, aesthetics and scenes that co-occur with it across music, film, TV, games, books and places. Its tags become the themes. Its demographics and heatmap become the Meta audience suggestion.
- **Tavily is why now.** It searches the past week's news only inside Qloo's themes, so an idea sits where a stable taste meets a current moment: an anniversary, a release, a meme, a local event. The headline becomes the ad copy's hook.
- **Cross-checks.** News volume without a Qloo rise reads as hype and counts for half; a Qloo rise with news counts in full. Qloo entities are often brands, artists or titles, so an idea uses the aesthetic, never the name. The merchant still runs `screen_trademark` (a Tavily search) on the phrase they pick before publishing, as the design playbook already says.
- **Nemotron writes, code ranks.** The ranking objective is products that sell, not novelty, so the formula lives in code where it's deterministic and can be recalibrated from real Fourthwall sales and Meta results later (follow-up issue).

### The score

All inputs are clamped to 0..1, then:

- demand = affinity, or 0.7 × affinity + 0.3 × min(activeAds / 20, 1) when the agent passed an active-ad count
- momentum = min(newsHits / 5, 1) × confirmation, where confirmation is 1 when Qloo's velocity is above 0, 0.5 when it's 0 or below, and 0.75 when Qloo returned none
- openness = 1 − min(marketHits / 10, 1)
- score = 0.45 × demand + 0.35 × momentum + 0.2 × openness

The weights sit in one exported constant (`SCORE_WEIGHTS`). Every idea returns its inputs (`signals`) next to its score.

### Competitors and ads

- The marketplace search returns up to 10 results from Etsy, Redbubble and Amazon. Their count is `marketHits`; the top 3 become `competitors`, with a price when the snippet shows one (`$12.99`). Tavily doesn't return prices as data, so the price is what the page text said.
- The Meta Ad Library is the strongest "this sells" signal: someone pays to advertise it. wovain can't call Meta server-side yet (Meta app review, #19). So the design playbook asks a host agent that has the Meta Ads MCP to call `ads_library_search` for the top themes and run `research_trends` again with `adCounts`. That second run spends another 6 Tavily credits, so the playbook offers it rather than doing it every time. Once #19's Meta part lands, autopilot calls the Ad Library through the merchant's own Meta connection instead.

### Code

- `apps/server/src/lib/qloo.ts`: `qlooFor(apiKey?)` returns a `QlooGet` (path, query, zod schema) built on `fetchJson`, or `undefined` without a key. `tasteOf(qloo, seed)` and `audienceOf(qloo, tags, within)` hold the requests and response schemas.
- `apps/server/src/lib/taste.ts` (new): the Qloo path, `researchTaste`, with `scoreIdea` as a pure function and `SCORE_WEIGHTS`.
- `apps/server/src/lib/trends.ts`: `createTrendResearch(client, ai?, model?, qloo?)` runs the Qloo path when there's a client and falls back to the existing news path. `UNTRUSTED` and `sourceOf` move to `tavily.ts` so both files share them without a cycle.
- `apps/server/src/tools/research.ts`: `research_trends` gains `adCounts`; new `suggest_audience`.
- `packages/shared/src/trends.ts`: `adCounts`, the per-idea Qloo fields, `ranker: "qloo"`, `qloo` status, and the audience input and result schemas.
- `apps/server/src/server.ts`: `createDeps` builds `qloo` once and passes it to trend research and the research tools.
- Playbooks: design (the Ad Library step, showing taste and moment) and campaign (offering `suggest_audience` as Advantage+ audience suggestions).

### Libraries checked

- `@qloo/qloo-harness` 0.1.26 is the hackathon kit's one package. It's a CLI, a stdio MCP server and a Pi agent; its `QlooClient` class isn't exported, and `@qloo/client` isn't published on npm. Spawning `qloo mcp` per request from App Hosting would add a process and the Pi agent runtime for 3 GET calls, and the kit says serverless isn't a supported route. So wovain calls the REST API through its own `fetchJson`, with the request shapes copied from the harness's workflows (`entity_tags`, `trends`, `audience_demographics`, `where_popular`).
- The hackathon host `https://hackathon.api.qloo.com` answers 401 "No API key found in request" without a key, so it exists. The harness defaults to `https://api.qloo.com`.

## Areas of concern

- **Unverified until the key arrives:** the hackathon host accepting the key, the response field names (`results.tags[].query.affinity`, `results.trending[].population_rank_velocity`, `results.demographics[].query.age/gender`, `results.heatmap[].location`), what velocity's sign means, and whether tag-only signals work for demographics and heatmap. The schemas are lenient and every field is optional, so a different shape degrades to fewer signals rather than an error. The live test checks them.
- **Cost:** a Qloo research spends 6 Tavily credits ($0.048) instead of 2, plus 3 Qloo calls against the event quota. Three themes is the bound.
- **IP:** Qloo returns brand, artist and title names. They never reach the result; they're only used to reject copy that names them.
- **Privacy:** only the seed and Qloo IDs go to Qloo, never merchant data (the kit's safe-use rules). Results describe aggregate affinities, and the tool text says so.
- **Prompt injection:** headlines and Qloo names reach Nemotron only inside JSON fields named `untrusted…`, under the same untrusted-data rule as today.
