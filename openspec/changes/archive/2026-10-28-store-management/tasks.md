# Tasks

## 1. Core

- [x] 1.1 `@wovain/core/store`: readiness, lifecycle moves, collections, promotions, orders, refund and cancel previews, variants, per-size prices and sample checkout over the Fourthwall MCP
- [x] 1.2 `PRICING_RULES.sizeSurcharges`, `sizePrices`, `baseCostCeiling` and `discountKeepsProfit`
- [x] 1.3 Unit tests with a fake MCP connection

## 2. API

- [x] 2.1 `flow/store.ts`: proposals, merchant requests, `stageRunDrop` and the executor
- [x] 2.2 `routers/store.ts` behind `store-management` and `autonomy-approvals`
- [x] 2.3 Inngest functions: the executor (no retries, idempotent per approval) and the promotion schedule
- [x] 2.4 Publish gate in `productStep`; campaigns only for live products
- [x] 2.5 Per-size prices when a product is created; a retired product can't be republished
- [x] 2.6 PGlite tests: drop staging, policy auto-approve, double delivery, readiness failure, R4 pending with preview, too-late cancel

## 3. Web

- [x] 3.1 `/dashboard/products` with readiness, store approvals, drops, products and orders
- [x] 3.2 Sidebar entry and breadcrumb only while the flag is on; en, es and fr messages

## 4. Config

- [x] 4.1 `sizeSurcharges` in the dev and next pricing rules (Pulumi). Production is unchanged.

## 5. Later (not in this change)

- [ ] 5.1 Order sync and promotion reconcile (ST7)
- [ ] 5.2 Fourthwall webhooks through the Platform API (ST8)
- [ ] 5.3 Pause linked ads before retiring, once live media buying exists
- [ ] 5.4 Partial cancels, refund caps per day, timed collection availability, limited editions
