# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/80

## Why

wovain made products and then stopped. A run created each product and published it in the same step, which breaks the rule that a product goes public only through a separate publish step. After that, wovain had no way to run the store: no readiness check, no collections, no pause or retire, no launch codes, no orders, no samples, and one price on every size. Indie designers need wovain to run the store for them, and every customer-visible or money-moving step has to go through the approval queue built in the foundation change (#58, #60).

## What Changes

- **Publish gate.** With the `store-management` flag on, a run's products stay hidden. They become a drop "in review" with a hidden Fourthwall collection, and the run queues a `store.drop.publish` action. The merchant's autonomy level decides whether it runs alone (`publish_ads_paused`) or waits for them. A run stages campaigns only for products that are already live.
- **Store readiness.** A check of the shop (site live, no verification hold, owner or manager role, shipping on, payouts set up). Publishing waits until the blocking checks pass; payouts only warn.
- **Collections per drop.** Each drop gets one Fourthwall collection, created hidden and published with its products.
- **Product lifecycle.** Draft (`hidden`), in review, live (`public`), paused and retired, with publish, unpublish and retire as queued actions. A retired product can't be published again.
- **Launch promotions.** A launch code for a drop is created switched off. Activation is its own action; once approved, Inngest switches the code on at its start and off at its end, because Fourthwall promotions have no schedule. A discount that would make a sale lose money is refused.
- **Order exceptions.** Orders list per shop or drop, without customer contact details. Refunds and cancels are R4 actions: they always wait for the merchant's confirm, and the approval card shows Fourthwall's cost preview, including what is charged to the shop's card. A cancel Fourthwall says is too late is refused before it is queued. The executor never retries them.
- **Samples.** A checkout link for the designer to order a sample at cost. The designer pays on Fourthwall; wovain only prepares the link.
- **Per-size pricing.** `PRICING_RULES` gains optional `sizeSurcharges` (dollars per size). New products and reprices set the base price, then the surcharged sizes the product has.
- **Products page.** `/dashboard/products` shows readiness, the store's approvals (approve or reject), drops with publish and launch-code planning, products with lifecycle actions, reprice and samples, and orders with refund and cancel requests.
- Merchant requests for R1 and R2 actions are approved in the merchant's name at once and audited as theirs. R3 and R4 requests wait for a second confirm.

## Capabilities

### New Capabilities

- `store-management`: readiness, the product lifecycle, drop collections, launch promotions, order exceptions, samples and per-size prices, all through the approval queue.

### Modified Capabilities

- `runs-and-approval`: with store-management on, a run's approved designs end as a drop in review, and the drop's publish is a queued action.

## Impact

- `packages/core`: `store.ts` (new), `pricing.ts` (`sizeSurcharges`, `sizePrices`, the discount guard), `fourthwall.ts` (exports `throwBulkErrors`)
- `packages/api`: `flow/store.ts`, `routers/store.ts`, `workflows/store.ts` (Inngest executor and promotion schedule), `flow/runs.ts` (publish gate), `flow/products.ts` (per-size prices, no republish of a retired product), `workflows/engine.ts` (registers the functions)
- `packages/db`: `product.status` gains `in_review`, `paused` and `retired`. It is a text column, so there is no migration.
- `apps/web`: the products page, the sidebar entry (only while the flag is on), messages in en, es and fr
- `infra/Pulumi.prod.yaml` (dev) and `infra/next/Pulumi.next.yaml` (next): `sizeSurcharges` in the pricing rules. Production is unchanged.
- Stacks on the foundation PR (#60) and must merge after it.
