# Design

## Context

The foundation change gave wovain one approval queue (`approval`, `audit_event`), the autonomy policy (`canAutoExecute`), drops (`drop`, `drop_item`) and the `wovain/approval.decided` event that executors listen for. Fourthwall is reached only through its MCP server, with the merchant's own OAuth grant. The MCP's money tools (`refund-order`, `cancel-order`) can charge the shop's card and say "always confirm with the user". Promotions have no start or end date. Orders page 10 at a time.

## Goals / Non-Goals

**Goals:** make runs honest about publishing, give the designer one page to run the store, and put every store write through the queue with an audit trail.

**Non-Goals:** Fourthwall webhooks (needs a Platform API credential), order sync into our own table, the store optimizer, TikTok Shop, support digests, mobile cards. These are later changes (research ST7, ST8, ST12, ST13, ST15, ST16).

## Decisions

1. **The queue is the only write path.** Each store write is an action type from the closed catalog in `@wovain/core/autonomy`. `proposeStoreAction` enqueues it under the merchant's autonomy settings. The Inngest function `store-execute-approval` listens for approved store decisions and calls `executeStoreApproval`, which moves the approval to `executing` (the lock), performs it and records `done` or `failed`.
2. **No retries for store actions.** The executor runs with `retries: 0` and Inngest idempotency on the approval ID. A failure is recorded on the approval and logged at error level, so it reaches Error Tracking. Refunds and cancels must never run twice; the other actions are safe to request again.
3. **Merchant requests.** When the merchant asks for an R1 or R2 action in the UI, the request is itself their decision: the action is enqueued as `proposedBy: merchant` and decided in their name at once, so the audit log shows who approved it. R3 and R4 actions (retire, refund, cancel) wait for a second confirm on the approval card.
4. **Refund and cancel previews.** The request calls Fourthwall's read-only preview first. The approval's `costPreview` holds the amount, the currency and `chargeToCardCents`. A preview reply without both amounts is an error, so it is never shown as "nothing charged".
5. **Promotions.** Creating the code (R1) creates it and ends it at once. The executor then queues `store.promotion.activate` (R2) with the window. Once that is approved, `store-promotion-schedule` sleeps until the start, switches the code on, sleeps until the end and switches it off, then records `done`. It retries 3 times. When it runs out of retries, `onFailure` logs at error level and records `failed`.
6. **Discount guard.** wovain's prices are the cost-plus floor (`priceFor`), so any discount takes profit below `minProfit`. The guard refuses a discount that makes a sale lose money, measured at the highest base cost the price allows (`baseCostCeiling`). Whether launch codes may go below `minProfit` is a founder decision (see the PR).
7. **Per-size prices from config.** Fourthwall's catalog does not give a cost per size. The surcharges are `PRICING_RULES.sizeSurcharges`, set per environment from Pulumi config. Only sizes the product has are sent.
8. **Lifecycle values.** `hidden` and `public` keep their names, because existing rows and the wizard use them, and they mean draft and live. `in_review`, `paused` and `retired` are added. The column is plain text, so there is no migration.
9. **Readiness is read live.** It is not stored. The products page reads it, and every publish checks it again before it acts.

## Risks / Trade-offs

- An Inngest outage leaves approved actions unexecuted. They stay `approved` and visible on the page, with nothing lost.
- A missed switch-off leaves a code live past its end. It is retried, then logged at error level. Reconciling promotions is a later change.
- Retire assumes there are no live ads. wovain's campaigns are always paused today. When live media buying lands, retire must pause the product's ads first.
- The MCP runs with the merchant's role. A DESIGNER or VIEWER role fails the readiness check, and the page says so.
