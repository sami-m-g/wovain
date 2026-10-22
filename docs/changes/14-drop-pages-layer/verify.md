# Verify: Drop the pages/ layer

## Tests added

`apps/server/test/integration/app.test.ts`: "the home page names the MCP url" checks `GET /` returns 200 with the `wovain` title and `<code>${site}/mcp</code>`. There was no home page test before.

## Checks run

`pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test` (60 passed), `test:integration` and `build` all pass.

## Review findings

`pr-review-toolkit` and `feature-dev` agents are not installed here, so `/simplify`-style and silent-failure reviews ran as one general-purpose agent. Findings: the card width changed from `min(100%, 26rem)` to `max-width` (restored); plain colors via `color-scheme` and translucent border are intentional; escaping of the site URL is handled by `hono/html`; no leftover `pages/` references; `public/favicon.ico` exists.

## Try it

Run `pnpm dev` and open http://localhost:3000/ in light and dark mode: one centered card with the `wovain` heading and the paragraph naming `<site>/mcp`.

## Departures from the plan

None. Source lines (src, CODEOWNERS, dependency-cruiser): +55, -102.
