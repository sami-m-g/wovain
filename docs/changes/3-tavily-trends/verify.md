# Verify: trend research with Tavily

## Tests added

- `apps/server/test/unit/trends.test.ts`:
  - Recency halves every 3 days and gives a missing or bad date 0.5.
  - The rule ranker groups shared title keywords, orders by source count × recency, leaves out the seed's own words, fills the rest with single stories, and copes with 0 or 1 results.
  - Research runs two news searches from the past week and removes duplicate links.
  - Nemotron's cited numbers (`mockModel`) become Tavily links, invented numbers drop out, and a model error falls back to the rules without logging the seed.
  - The trademark screen searches the exact phrase, with quotes removed.
  - Inputs are bounded, and `createSearch()` without a key builds no client.
  - Security: `javascript:`, `data:` and `ftp:` links are dropped. Titles lose their markup and are clipped to 300 characters, and so are snippets.
  - Security: an instruction injected in a snippet reaches the model only inside `untrustedResults`, the system prompt tells the model never to follow instructions in the results, and the only link that comes back is Tavily's.
- `apps/server/test/integration/research-tools.test.ts`, over the real MCP client:
  - Both tools answer `{ configured: false }` without a key and name `TAVILY_API_KEY`.
  - `research_trends` returns ranked, linked ideas and the untrusted note.
  - `screen_trademark` returns hits and its caveat.
  - An oversized seed is refused before Tavily is called.
  - A Tavily failure becomes a user-safe error, and the upstream text appears neither in the result nor in the log.
- `apps/server/test/live/tavily.test.ts`: one real research run (2 credits), opt-in through `pnpm test:live`.

## Checks run

All pass on the final tree:

| Command | Result |
| --- | --- |
| `pnpm check` | clean |
| `pnpm typecheck` | clean |
| `pnpm knip` | clean |
| `pnpm arch` | no violations |
| `pnpm dupes` | 0 clones |
| `pnpm test` | 89 passed |
| `pnpm test:integration` | 51 passed |
| `pnpm test:live` | Tavily passed (key piped from `pulumi config get tavily-api-key`, never printed); Nemotron skipped (no Nebius key) |
| `pnpm build` | ok |

The live test ran twice, before and after the security fixes: 4 Tavily credits in all.

## Libraries checked

- `@tavily/core` 0.7.14 (official SDK) is used.
- Not used:
  - the Tavily MCP server (the call has to happen on wovain's own server);
  - a Genkit Tavily plugin (none ships for JS);
  - `@langchain/tavily` (it pulls in LangChain);
  - raw `fetch` / `fetchJson` (the issue asks for the SDK).

## Review findings

`/simplify` ran four reviewers.

- **Reuse:**
  - The catch-and-log block in `tools/judge.ts` was copied, so it's now `userSafe` and `logErrorClass` in `lib/tool-result.ts`, used by both tools and the ranker fallback.
  - The `{ configured: false }` reply is `notConfigured`.
  - The Genkit mock setup is `mockAi` in the test helpers.
  - `connectClient` takes a deps object instead of more positional arguments.
  - Skipped: moving the inline `genkit({})` and `mockModel` setups in `design-judge.test.ts` and `telemetry.test.ts` to `mockAi`, which would touch files outside this change.
- **Simplification:**
  - The repeated source lookup is `sourcesAt`.
  - The `for` loop that called `bestGroup` twice is a `while`.
  - `Date.parse(hit.publishedDate ?? "")` replaces the NaN detour.
  - `trendReplySchema` extends the shared idea fields.
  - Unused exported types are gone, and the search options are a constant.
  - Skipped: dropping `async () => await …` wrappers, because the lint rules (`require-await`, `return-await`) require them.
- **Efficiency:**
  - Two Genkit instances per process are now one (`createDeps`).
  - The `createServer` defaults that could run per request are gone.
  - `byWord` pushes in place.
  - Skipped: `screen_trademark` taking several phrases in one call. The cost per phrase is the same, and one phrase per call keeps the tool simple.
- **Altitude:**
  - The env-to-service wiring that `server.ts` and `http.ts` both held is now one `createDeps(env)`.
  - Skipped: a `registerOptionalTool` wrapper. Three tools don't justify the indirection yet.

Security review (relayed):

- Indirect prompt injection from Tavily titles and snippets. Fixed:
  - The results sit under `untrustedResults` in the prompt, and the system prompt says never to follow instructions in them.
  - The tool results carry a `note` with the same rule, as do the tool descriptions and the design playbook.
  - Only http and https links pass (`toHits` and `z.url({ protocol })`).
  - Titles are stripped of markup and clipped, and snippets are clipped.

The `pr-review-toolkit` agents (code-simplifier, silent-failure-hunter) aren't installed in this session, so the silent-failure pass was done by hand:

- Both tools log the error class only and rethrow one user-safe message.
- A ranking failure falls back to the rules and logs its class.
- An empty result list is now covered in the playbook ("an error or an empty list, ask the merchant for an idea").

## Try it

1. Put `TAVILY_API_KEY` in `apps/server/.env`, run `pnpm dev`, connect an agent and say "I sell to pickleball players and have no idea yet". The agent calls `research_trends` and lists 3 to 5 ideas with links.
2. Approve a design: the agent calls `screen_trademark` with the title's key phrase before publishing, and asks only if it finds hits.
3. Without the key, both tools answer `configured: false`, and the playbook goes on without them.
4. In production, `infra:production` writes the `tavily-api-key` secret version before `deploy:production` deploys with `TAVILY_API_KEY`.

## Departures from the plan

- `createDeps(env)` in `server.ts`, one shared Genkit instance, and the helpers in `lib/tool-result.ts`, all from review (see `plan.md`).
- The prompt-injection hardening, from the security review.
- The live test ran a second time after the security fixes (2 more credits).
