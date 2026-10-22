# Verify: Merchant dashboard

## Tests added

- `apps/server/test/unit/dashboard.test.ts`: the row reader on structured, JSON-text and `columns` plus `rows` replies; column names in any case; numbers from strings and money objects; upstream text stripped of control characters and cut to 80 characters; Meta ads rolled up by campaign and concept with ROAS and CPA only where defined; sales totals, `utm_content` mapped to the Meta ad, and R1 failing on 2 shop orders against 8 Meta purchases; the cache (one minute, per merchant, a failed gather not kept, a size cap).
- `apps/server/test/integration/dashboard-tools.test.ts` (emulators, fake Fourthwall and Meta MCP servers with real OAuth): nothing connected gives Connect prompts and no sections; both connected give every section, the merchant's own ad account and range in Meta's call, and report text kept out of the agent's prose; a failing Fourthwall marks `error` and keeps Meta, and a repeat call is served from the cache; optimizer actions show when present and a bad document is skipped; a range outside 7d, 28d and 90d is refused.
- `apps/widgets/src/dashboard/dashboard-widget-view.stories.tsx`: full data, partial connections, empty, nothing connected (two Connect buttons at most), a failed connect, and loading, each in light and dark where it draws, with play tests and the a11y check.
- E2E: a "Dashboard" step after the campaign (`apps/server/test/e2e/journey.test.ts`), so the proof report and the demo show it.

## Checks run

| Command | Result |
| --- | --- |
| `pnpm check` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm knip` | Pass |
| `pnpm arch` | Pass |
| `pnpm dupes` | Pass, 0 clones |
| `pnpm test` | Pass |
| `pnpm test:integration` | Pass |
| `pnpm test:stories` | Pass |
| `pnpm build` | Pass, `dashboard.html` built |
| `pnpm test:e2e` | Pass; the report's dashboard screenshot shows every section |

## Review findings

`/simplify` ran four reviewers (reuse, simplification, efficiency, altitude). The `pr-review-toolkit` agents (code-simplifier, silent-failure-hunter) aren't installed in this environment; the silent-failure angle was checked by hand (below).

Fixed:

- Cost per sale and its shop-first rule moved from the widget to the server (`costPerSale` in the schema), so the widget and the agent's text say the same thing.
- `newConversationId` from `lib/meta-draft.ts` replaces a second generator.
- The `wovain dN · slot` parser sits next to `adName` in `rules.ts` (`parseAdName`).
- `report-rows.ts` no longer depends on the dashboard's label length; the sections cut what they display.
- Which providers get a Connect prompt (`connectPrompts`, `isConnectPrompt`) and the range in days (`rangeDays`) are defined once in shared.
- Provider names in the agent's text come from `providers[id].title`.
- `fourthwall()` returns named rows; the Meta path reads its connection and the campaign record together; the cache drops expired entries on insert; the product badges are one map; the summary says "too few sales to compare" for an unknown check instead of "agree".

Skipped:

- One MCP session per provider per gather (upstream opens a client per call): a change to `lib/upstream.ts` for every tool, outside this issue. With the one-minute cache it costs a few handshakes per merchant per minute at most.
- Limited queries for runs and designs: the breakeven needs every live design, and other callers read all runs.
- Logging the error class in `read()`: the issue says nothing is logged; the widget shows the failure as the provider's state instead.
- Dropping `dashboard_data` (no caller in the repo yet): the issue asks for it, for agents that want the numbers without the widget.
- A shared `StatusBadge` across all widgets and a shared list-cap constant: they touch the other widgets; left for a follow-up.
- Silent failures: `read()` turns a thrown or `isError` reply into `state: "error"`, which the widget and the agent's text both show; the optimizer read falls back to no actions on purpose (its records are optional).

## Try it

In the review app (or a local server with Fourthwall and Meta connected), ask the agent "how's my shop doing?". It calls `show_dashboard`. Without a connection, the widget shows a Connect card; press it, connect in the browser, then ask again. `dashboard_data({ range: "7d" })` returns the same data for a shorter window.

## Unverified live

- The reply envelopes of Fourthwall's `ecommerce_get-sales-over-time-report`, `-top-products-by-units-sold-report` and `-sales-by-utm-report`, and of Meta's `ads_get_ad_entities`: the tests use the documented column names inside guessed envelopes. No Fourthwall shop was signed in for this session.
- The Meta field names (`omni_purchase`, `omni_purchase_values`, `amount_spent`) are from the tool's field list, not checked with `ads_get_field_context`.

## Departures from the plan

- The gatherer is split in two files (`lib/dashboard.ts` for reads and the cache, `lib/dashboard-sections.ts` for the pure shaping) to stay under the file-length cap.
- `README.md` lists no tools, so it didn't change.

## Duo Code Review (MR !68)

All five recommendations fixed:

- Orders from Meta links are counted on every UTM row before the section's top-8 cap (`metaOrdersFrom`), so R1 and cost per sale don't undercount; a unit test has 12 rows above the Meta one.
- A dashboard where Fourthwall or Meta is missing or failed isn't cached, so asking again right after connecting reads fresh; the integration tests check both sides.
- The agent's text says when Fourthwall or Meta couldn't be read, so it doesn't read the gap as zero.
- `NothingConnectedDark` and `ConnectFailsDark` stories.
- Run decisions are keyed by their time and optimizer actions by their id (both now in the schema), so keys can't repeat.
