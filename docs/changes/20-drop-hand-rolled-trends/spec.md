# Spec: Remove hand-rolled code from trend research and the Genkit telemetry filter

Intent: [intent.md](intent.md)

## Requirements

1. Without Genkit, with no results, when the model call fails or when every model idea loses its sources, `research` returns the `count` (default 5) highest-scoring results, one idea each: `idea` is the result's title, `sources` is that result, and there is no `angle` or `why`. `ranker` is `"tavily"`.
2. Results from the two searches are de-duplicated by URL and sorted by Tavily's `score`, highest first, before either ranker sees them.
3. The Nemotron prompt numbers results from 1, says so, and a citation `n` maps to result `n`. Numbers with no result drop out, as today.
4. `tavily.ts` takes its types from `@tavily/core`. Search goes through a `Pick<TavilyClient, "search">`, so tests pass a fake client.
5. Only http and https results come through; titles and snippets are clipped to the schema limits.
6. `packages/shared/src/trends.ts` declares the source shape once, used by ideas and trademark hits.
7. Telemetry drops every span whose `instrumentationScope.name` is `"genkit-tracer"` and passes the rest unchanged.
8. The untrusted-data note stays in the tool result, the tool descriptions, the ranking prompt and the playbook. Nothing about queries or results is logged.

## Design

Checked before writing anything:

- `@tavily/core` 0.7.14 exports `TavilyClient`, `TavilySearchOptions` and `TavilySearchResponse`. `TavilySearchResult` is declared but not exported, so the result type is `TavilySearchResponse["results"][number]`. Each result carries `score` (relevance). The SDK doesn't promise an order, and two searches get merged, so the code sorts by `score`.
- `@genkit-ai/core` 1.42 `lib/tracing/instrumentation.js` names its tracer `TRACER_NAME = "genkit-tracer"`.
- `@opentelemetry/sdk-trace` 2.11 (re-exported by `sdk-trace-node` and `sdk-trace-base`) types `ReadableSpan.instrumentationScope: InstrumentationScope`.
- OpenTelemetry JS has no built-in filtering span processor, and a `Sampler` doesn't see the instrumentation scope, so a small processor that forwards everything except Genkit spans is the least code.

`tavily.ts`:

- `type SearchClient = Pick<TavilyClient, "search">`, `type SearchResult = TavilySearchResponse["results"][number]`.
- `trendResearchFor(apiKey?, ai?)` in `trends.ts` builds the client: `undefined` without a key, otherwise `tavily({ apiKey })`.
- `searchWeb(client, query, options: TavilySearchOptions)`: basic depth and a 20 s timeout, then keeps http and https results with clipped title and snippet. `plain()` goes: results only ever leave as JSON (the tool's text is `JSON.stringify` of the result, the structured content is JSON, and the prompt carries them inside a JSON string), each marked untrusted.

`trends.ts`: `rankByRules`, `recency`, `keywordIndex`, `bestGroup`, the stop words and their constants go. `byRelevance(hits, count)` maps the top results to source-only ideas. `rankByModel` sends `n: index + 1` and maps `n - 1` back.

`packages/shared/src/trends.ts`: one `sourceSchema` (`title`, `url`, optional `publishedDate`). `angle` and `why` become optional on the returned idea (the model's reply still requires them). `ranker` is `"nemotron" | "tavily"`. Nothing here is stored, so there's no record to migrate.

`telemetry.ts`: `GenkitSpanFilter` wraps the batch processor and skips `onEnd` for Genkit spans.

## Areas of concern

- **Losing Genkit traces.** Genkit spans no longer reach GitLab Observability at all, where before they went out stripped. The `mcp.request` span still records each tool call, its duration and status, and Genkit's own spans held little once stripped.
- **Weaker fallback ideas.** Without Nemotron an idea is one news headline with its link, which the host agent turns into a design. That's honest about what code can tell from search results.
- **Markup in titles.** Titles keep any markup a site put in them. They only travel as JSON strings, marked untrusted, and no widget renders them.
