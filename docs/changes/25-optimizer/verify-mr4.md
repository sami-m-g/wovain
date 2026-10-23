# Verify: MR 4, observe and reconcile with polling (#25)

Plan MR 4: the optimizer reads each merchant's Fourthwall and Meta on their own grants, keeps what it saw in daily snapshots, and turns 30 days of them into findings and kill blocks with code alone. Nothing calls a model yet (MR 5), and nothing writes to Meta or Fourthwall (MR 6).

## What a run does now

1. `/tasks/optimizer/run` takes the lease and counts one run against the merchant's daily 400.
2. **Observe** (`run.ts`, `collect.ts`, `observe.ts`). Stored webhook events become snapshot rows. A `poll`, `daily` or `review` run also reads the merchant's accounts within a 16-call upstream budget:
   - **Fourthwall** (`sources/fourthwall.ts`): the live products' variants and stock (`ecommerce_get-offers-by-ids`), orders updated since the cursor (`ecommerce_get-orders`, up to 5 pages of 10), the fulfillment of orders still in production (`ecommerce_get-fulfillment-details` with cancelled ones), and sales by UTM, sessions by source and profit, cached an hour.
   - **Meta** (`sources/meta.ts`): `ads_get_ad_entities` at `level=ad` with `time_increment: "1"` for yesterday and today, plus the campaign's `daily_budget` and `effective_status`. Only wovain's campaign counts.
   - **Trends** (`sources/trends.ts`, daily sweep only): one Qloo velocity per niche, cached per niche in `trendCache/{key}/days/{date}`.
3. A polled order whose status the snapshots don't have becomes a `poll` event, stored once. Run records count these as webhooks missed.
4. **Triage** (`facts.ts`, `triage.ts`): R1 to R5, every POD rule from MR 3, and the kill blocks. Findings are saved open or closed (`store.ts saveFindings`). Only a new or changed finding, or an on-demand review, would reach the model in MR 5.
5. Polling follows delivery. A Meta read that shows delivery, or an `effective_status` webhook to `ACTIVE`, moves `activeUntil` 24 hours ahead on the state and on `optimizerDue`. The 15-minute `optimizer-poll` job queues only merchants inside that window, and the hourly `optimizer-daily` job queues merchants whose `reviewHourUtc` it is.

## Verified (2026-10-23)

From the Fourthwall MCP's own tool schemas:

| Question | Answer |
| --- | --- |
| Do refunds carry a reason? | Yes. `get-order-details-by-ids` lists each refund "with status, amount, issuer, reason". The poll reads the reason from the order's refund summary when the list has one, and keeps it (500 characters at most). |
| Do chargebacks show in payout transactions? | No. `get-payout-transactions` rows are transfers and payouts (`transferAmount`, `payoutAmount`, `status`, `paidToType`) with no order or dispute. The poll doesn't call it. Chargebacks reach the ledger only through a reversal with `kind: "chargeback"`, and nothing produces one yet. |
| Fourthwall production times per blank | Unverified. `omni_knowledge` answered "Sign in to Fourthwall" in this session, so the help couldn't be read. Code guesses no number: POD-O3 is skipped (`productionDays` undefined), and no shipped order counts as stuck (`carrierDays` infinite). Address changes after shipping and production errors still raise their alerts. |
| Does a polled order carry UTM tags? | No. Neither `get-orders` nor `get-order-details-by-ids` lists `trackingParams`. Only the `ORDER_PLACED` webhook has them. The poll attributes sales to ads through `get-sales-by-utm-report`, whose rows have `utm_content` and `contributions` (Fourthwall's count of transactions). |
| Raw daily ad-level insights from the Meta Ads MCP | `ads_get_ad_entities` documents `time_increment` (`"1"` is daily) and the ad-level fields used here (`amount_spent`, `impressions`, `link_click`, `frequency`, `omni_purchase`, `omni_purchase_values`, `effective_status`, `campaign_id`). Not run live: the owner hasn't connected Meta through wovain. `3_second_video_plays` isn't an ad-level field, so hook rate stays empty. |

## Decisions in code

- **Net sales per ad** are the larger of two counts on settled Fourthwall data: the ad's UTM-tagged webhook orders less their reversals, and Fourthwall's sales-by-UTM count. Webhooks aren't registered today (verify-mr1.md), so the second is what works. A kill never rests on the smaller count.
- **Product sessions** for POD-K2 are the design's Meta link clicks. Fourthwall's sessions report is per source, not per product.
- **Kill blocks** open on a failing R1 or R2 and lift only when that check passes again. A check that couldn't run, such as no settled Meta days or no sessions report, keeps its block.
- **The campaign's rules** (POD-E4, POD-B1, over breakeven) run only once Meta has given a daily budget. Without one there is nothing to measure a scale or a cut against.
- **POD-M1** has no CAPI event counts until Meta connects through wovain (MR 7), so only a failing R1 raises the tracking gap.
- **Trend cache.** Fixed after a security finding: the shared cache keeps only the niche key and Qloo's answer for it. Qloo is asked with the key's words, never one merchant's wording, and each reader gets the row back under their own niche.
- **Quotas** (`quota.ts`): runs 400, upstream 800 (taken 16 per poll), Qloo 4 (3 per niche check), as in spec section 7. Past a limit a run returns `limited` and its events wait. A poll without budget reads nothing.

## Tests added

- `test/integration/optimizer-observe.test.ts` (emulators, reads stubbed at the `Call` layer):
  - a signed `ORDER_PLACED` becomes an order row with its ad (`utm_content`), design and UTM source, and the buyer's email isn't stored;
  - a refund the poll finds reverses the sale and keeps Fourthwall's reason;
  - an unavailable variant raises `blank_out_of_stock` (POD-O1), and a later in-stock read closes it;
  - an order no webhook delivered is stored once as a `poll` event;
  - without Meta connected, Fourthwall is observed and Meta is recorded as `missing`;
  - Meta purchases with no net sales open R1 blocks on the ad and its campaign;
  - polling stops 24 hours after the last delivery, the daily sweep still queues the merchant, and a doubled tick queues nothing twice;
  - the shared trend cache holds no merchant's wording.
- `test/unit/optimizer-sources.test.ts`: variants' stock, color and size; orders to ledger rows, refunds with reasons and cancellations, buyers dropped; production errors; sales by UTM and sessions from Meta; Meta daily rows and the budget in dollars; the snapshot merge keeping what only the webhook knew; kill blocks opening, keeping a dismissal and lifting only on a pass.
- `optimizer-intake.test.ts` now runs on the new runner.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm check` | pass |
| `pnpm typecheck` | pass |
| `pnpm knip`, `pnpm arch` | pass |
| `pnpm dupes` | pass, 0 clones (the dashboard and the optimizer share `lib/upstream-rows.ts`) |
| `pnpm test` | pass, 236 |
| `pnpm test:integration` | pass, 257 |
| `pnpm build`, `pnpm test:stories`, `pnpm test:e2e` | pass |
| `pnpm infra:preview` | 3 to create: the `optimizer-poll` and `optimizer-daily` scheduler jobs and the `optimizerDue (enabled, activeUntil)` index. 192 unchanged. |

## Departures from the plan

- The plan puts Meta insights polling in MR 7. It's here, built and tested with stubs, and reads nothing until the merchant connects Meta.
- Event-only runs don't call upstream. Only `poll`, `daily` and `review` runs read the accounts, so a burst of webhooks costs no upstream calls.
- `trendCache/{nicheKey}/{date}` became `trendCache/{nicheKey}/days/{date}`, since Firestore paths alternate collection and document.
- New snapshot rows the plan didn't name: `utm`, `profit`, `metaAds` and `campaigns`.
- Stored orders now default an empty `utm`. Firestore drops an empty map, so an order with no tags failed to parse on read.

## Not done

- No tool turns the optimizer on, so `optimizerDue` has no merchants yet (MR 5).
- Production times per blank and the carrier window are unverified, so POD-O3 and the stuck-shipment half of POD-O5 don't fire.
- Meta's half has run only on stubs.
