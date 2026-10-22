# Spec: trend research with Tavily

Intent: [intent.md](intent.md)

## Requirements

1. `apps/server` depends on `@tavily/core` pinned exactly at 0.7.14 (released Oct 6, outside Renovate's 7-day window; MIT; depends on axios, js-tiktoken and https-proxy-agent, none with install scripts).
2. `research_trends` takes `{ seed }`, a niche, audience or seed idea (1 to 200 characters, trimmed), plus an optional `count` (3 to 5, default 5).
3. It runs two basic-depth Tavily searches in parallel, both `topic: "news"`, `timeRange: "week"`, `maxResults: 10`:
   - `"<seed> trends"` for what's current in the niche;
   - `"<seed> t-shirt OR merch OR meme"` for what people already wear or joke about. Results are merged and de-duplicated by URL.
4. It returns `{ configured: true, ranker: "nemotron" | "rules", ideas }`. Each idea is `{ rank, idea, angle, why, sources: [{ title, url, publishedDate? }] }`, with 1 to 5 sources per idea, and every source URL comes from a Tavily result.
5. Ranking:
   - **With `NEBIUS_API_KEY`:** Nemotron gets the seed and the numbered results (title, a 300-character snippet, date) through `generateObject`. It returns ideas that cite results by number, never by URL. Code maps the numbers to URLs and drops any number that doesn't exist. If the model call fails or every idea is left without a source, the rule ranker runs instead.
   - **Without it (rules):** results are grouped by the most frequent shared title keyword (stop words and the seed's own words removed). Each group scores `sources × recency`, where recency is `0.5 ^ (age in days / 3)` from `publishedDate` (0.5 when there's no date). The top groups become ideas: `idea` is the keyword phrase, `angle` the best result's title, `why` "N sources this week".
6. `screen_trademark` takes `{ phrase }` (1 to 120 characters) and runs one basic-depth search `"\"<phrase>\" trademark"` with `exactMatch: true`, `maxResults: 5`, no time range. It returns `{ configured: true, phrase, hits: [{ title, url }], note }`. `note` says that hits are leads to check on the USPTO and EUIPO databases, not a legal answer, and that no hits doesn't mean the phrase is free. It never blocks a publish.
7. Without `TAVILY_API_KEY`, both tools answer `{ configured: false }` with one line naming the key. The Tavily client is never built without a key, because `@tavily/core` falls back to `process.env.TAVILY_API_KEY` and then to a keyless mode.
8. Errors: a Tavily or model failure is logged with the error class only and rethrown as one user-safe error ("Trend research failed; ask the merchant for an idea instead."). `@tavily/core` puts the response body in its error message, so the message is never logged.
9. Nothing about the query or the results reaches logs or telemetry. There's no HTTP auto-instrumentation in `telemetry.ts`, and the Genkit spans for the ranking call already pass through `RedactingSpanProcessor`.
10. The design playbook gets a "No idea yet" section (call `research_trends` with the merchant's niche or audience, show the ideas with their links, let the merchant pick) and an approval step: before `ecommerce_create-offers-from-designs`, call `screen_trademark` for the title's key phrase and any text in the artwork. On hits, show them and ask whether to go on.
11. `apphosting.yaml` lists `TAVILY_API_KEY` from secret `tavily-api-key`. `infra/Pulumi.prod.yaml` holds the encrypted value. `infra/index.ts` already creates a `SecretVersion` only when `config.getSecret(name)` has a value, so it needs no change.
12. Unit and integration tests mock Tavily. `test/live/tavily.test.ts` runs one real search when `TAVILY_API_KEY` is set (`pnpm test:live`).

## Design

### Package, checked in its `dist/index.d.ts` (0.7.14)

- `tavily({ apiKey })` returns a `TavilyClient` with `search(query, options)`. Options used: `searchDepth: "basic"`, `topic: "news"`, `timeRange: "week"`, `maxResults`, `exactMatch`, `timeout` (seconds; default 60, set to 20).
- The response is `{ results: [{ title, url, content, score, publishedDate }], usage?: { credits } }`.
- Without `apiKey` it reads `process.env.TAVILY_API_KEY` and otherwise sends `X-Tavily-Access-Mode: keyless`. wovain builds the client only from `env.TAVILY_API_KEY`.

Checked and not used:

- The Tavily MCP server: wovain is the MCP server here, and the call has to happen on the server at runtime.
- Genkit's Tavily plugin: none ships for JS.
- `@langchain/tavily`: pulls in LangChain for one call.
- Raw `fetch`: the official SDK is what the issue asks for.

### Files

`packages/shared/src/trends.ts` (new): `trendSeedSchema`, `trendIdeaSchema`, `trendsResultSchema`, `trademarkInputSchema`, `trademarkResultSchema`, and the model-side `trendReplySchema` (ideas citing result numbers). All strings bounded.

`apps/server/src/lib/tavily.ts` (new): `createSearch(apiKey?)` returns `undefined` without a key, otherwise a narrow `Search` function `(query, options) => Promise<SearchHit[]>` over `tavily({ apiKey }).search`. Tests pass a fake `Search`, so nothing mocks the module.

`apps/server/src/lib/trends.ts` (new):

- `rankByRules(seed, hits, count)`: pure, unit-tested.
- `createTrendResearch(search, ai?)` runs the two searches, then the Nemotron ranker when `ai` exists, with the rule ranker as fallback.
- `screenTrademark(search, phrase)`.
- `trendResearchFor(env)` builds both from the keys.

`apps/server/src/tools/research.ts` (new): registers `research_trends` and `screen_trademark` (read-only, `openWorldHint: true`), the same pattern as `tools/judge.ts`.

`apps/server/src/server.ts` and `http.ts`: like `designJudge`, built once per process and passed through `createServer`'s deps object.

`apps/server/src/lib/ai.ts`: `models.trends` (the same Nemotron 3 Super id). The ranking reuses `generateObject` at temperature 0.4.

## Areas of concern

- **Cost.** Per Tavily's credits page (docs.tavily.com/documentation/api-credits), basic search is 1 credit, and pay-as-you-go is $0.008 per credit, with 1,000 free credits a month.
  - `research_trends`: 2 credits, $0.016.
  - `screen_trademark`: 1 credit, $0.008.
  - With Nebius set, the ranking adds one Nemotron call: about 4k tokens in and 600 out, well under a cent at the unverified Eden AI listing.
  - A full design with research and a screen is about $0.024 in Tavily credits. The free tier covers about 330 such flows a month.
  - There's no per-user rate limit: every call sits behind sign-in and the email allowlist.
- **Rule-ranker quality.** Keyword grouping on news titles is rough. It shows real, linked trends, and the host agent turns them into designs, so it's good enough as the fallback. Nemotron gives better ideas once its key exists.
- **Trademark screen.** A web search isn't a trademark search. Its value is catching obvious hits ("Just Do It", film quotes). The note and the playbook say so. #4 covers the copyright side.
- **Privacy.** The seed and phrases go to Tavily (and the results to Nebius when set). No merchant identity goes to either. Logs carry the error class only.
- **Records.** No Firestore shape changes.
