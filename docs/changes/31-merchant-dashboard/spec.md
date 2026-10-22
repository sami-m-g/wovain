# Spec: Merchant dashboard

Intent: [intent.md](intent.md)

## Requirements

1. `dashboard_data({ range })` takes `range` in `7d`, `28d` (default) or `90d` and nothing else, and returns `{ dashboard }` checked against `dashboardResultSchema` (`packages/shared/src/dashboard.ts`).
2. `show_dashboard({ range })` returns the same result and opens the `dashboard` widget.
3. Sources run in parallel: three Fourthwall reports, one Meta read, and the store (designs, autopilot runs, optimizer actions, settings). One source failing or missing leaves the others in place.
4. Results are cached per merchant and range for 60 seconds, in the process, keyed by the signed-in `userId`, at most 200 entries.
5. Every upstream call uses the merchant's own grant through `upstream.call` with `userId` from the store; no tool input names a merchant, shop or ad account.
6. Upstream strings are cut to a fixed length with control characters removed, shown as text only, and the tool's text says they are data. Every array is capped. Nothing from a reply is logged.
7. Connection states: `connected`, `missing` (not connected or refused), `unavailable` (server can't connect it), `error` (the call failed). A missing Fourthwall or Meta shows a "Connect X" card whose button calls `connect_account` and opens the link.
8. Optimizer actions from `users/{uid}/optimization/state/actions` show when present (the 6 newest), parsed with `actionRecordSchema`; invalid documents are skipped.

## Design

### Shared (`packages/shared/src/dashboard.ts`)

`dashboardRangeSchema`, `dashboardSchema` and `dashboardResultSchema`. Sections:

| Section | Fields | Source |
| --- | --- | --- |
| `connections` | provider, state | `upstream.connected`, call outcomes |
| `sales` | `series` (date, revenue, profit, orders), `totals` (revenue, profit, orders, AOV), `topProducts` (5), `utm` (8, each mapped to an ad and design when `utm_content` is a Meta ad id) | `ecommerce_get-sales-over-time-report`, `-top-products-by-units-sold-report`, `-sales-by-utm-report` |
| `ads` | `totals`, `campaigns`, `ads`, `concepts`: spend, purchases, purchase value, ROAS, CPA | `meta_ads` `ads_get_ad_entities` at ad level for the range; campaigns and concepts are sums of the ad rows; a concept is the slot in the ad name `wovain dN · slot` (`adName` in `rules.ts`) |
| `reconciliation` | Meta purchases, shop orders from Meta UTMs, status | `checkPurchases` (R1) from `optimizer/reconcile.ts` with `settings.optimizer.disagreementPct` |
| `breakevenPerSale` | the lowest live product's breakeven | design quotes (`economics.ts` math) |
| `products` | design id, title, status (live, hidden, publishing, draft, rejected, skipped), link | `designs` |
| `runs` | 3 newest runs, last 3 decisions each | `autopilotRun` |
| `optimizer` | 6 newest actions: type, status, target, reason | optimizer action records, optional |

AOV is revenue over orders and ROAS and CPA come from `optimizer/math.ts` (`roas`, `cpa`), so a zero denominator gives no number instead of infinity.

### Server

- `lib/reply-json.ts`: the JSON roots of a tool reply (structured content plus JSON text blocks), moved out of `lib/fal-media.ts` so both use it.
- `lib/report-rows.ts`: the first array of row objects in a reply (or a `columns` plus `rows` table, zipped), and `num` and `str` readers that match a column by name ignoring case, `_` and `-`, and accept numbers, numeric strings and `{ amount }` or `{ value }` money objects.
- `lib/dashboard.ts`: `gatherDashboard({ store, upstream, range, now })` and `createDashboardCache()`.
- `tools/dashboard.ts`: both tools, registered with `registerAppTool`; `dashboard_data` is visible to the model and the app.
- `store.ts`: `getDesigns()` and `getOptimizerActions(limit)`.
- `server.ts`: `createDeps` builds one cache per process.

### Widget (`apps/widgets/src/dashboard/`)

One column, no tabs, no inner scroll. A coach line, then the KPI row leading with breakeven cost per sale, then sections that only render when they have data: a sales chart (inline SVG bars for revenue with a profit line, using the kit's text and border tokens so it reads in both themes, with a visually hidden data table for screen readers), top products, sales by UTM, ads by campaign, concept and ad, the reconciliation line, products, runs and optimizer actions. Connect cards for Fourthwall and Meta use the accent on their primary buttons; that's the only place buttons appear, so there are at most two.

## Areas of concern

- **Isolation:** the cache key is the store's `userId`, which comes from the verified token; ad account comes from the merchant's own campaign record or their own Meta grant.
- **Prompt injection:** product names, campaign names and UTM values come from the merchant's accounts. They're trimmed, shown as text, and the tool text carries `UNTRUSTED`.
- **Unverified shapes:** the readers accept snake or camel case and several envelopes. A reply that matches nothing gives an empty section, not an error.
- **Cost:** four upstream calls per minute per merchant at most, thanks to the cache. No paid calls.
