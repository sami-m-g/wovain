# Intent: Optimization agent, a per-merchant loop that diagnoses, acts, measures and learns

Paused 2026-10-25: code removed from main in [!80](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/80), plan kept.

Data left in Firestore from the optimizer's runs, to clean up later or reuse when it comes back: `users/{uid}/optimization/state` and its subcollections (`actions`, `cache`, `diagnoses`, `events`, `findings`, `hooks`, `inbox`, `runs`, `snapshots`), and the top-level `fourthwallShops`, `metaAdAccounts`, `optimizerDue` and `trendCache/{nicheKey}/days`. Only `events` has a TTL (`ttl-optimizer-events` in `infra/index.ts`, kept until 2026-11-25); the rest stays until someone deletes it.

Issue: #25

## Problem

> the wovain optimization agent. It's a per-merchant service that continuously monitors their Meta campaigns and Fourthwall sales and runs the full improvement loop. It does more than kill or scale: it diagnoses what went wrong, says what to do next, applies safe actions or proposes them, then measures the effect and learns.

wovain's job ends at launch today. After that, five Meta automated rules (`packages/shared/src/rules.ts`) pause an ad at 3× breakeven spend with no sales, pause an expensive one, scale the budget and send an alert. They see only Meta's numbers. They can't tell a creative that nobody clicks from a product page that nobody buys from, they can't see a sale the shop recorded and Meta missed, and they never say what to try next. Nothing records whether a change worked, so the next design and the next ad start from zero.

They also miss everything that happens after a sale. A blank that goes out of stock keeps its ads running. A design that prints badly piles up refunds while Meta reports a healthy ROAS. A late production batch or a shipping problem shows up as chargebacks weeks later. None of it reaches the ads.

A print-on-demand merchant feels this more than most advertisers. A $30 tee leaves about $10 per sale before ads, so a single bad day eats the week's profit, and samples stay small: an ad that has spent $25 with no sale may be fine or may be dead. The merchant also can't sit in Ads Manager all day, and ChatGPT can't start a conversation to tell them.

#5 (checklist slice 6) planned a check-in widget per fired rule. This issue grows that into a service that runs for each merchant, reacting to what happens in their shop and their ad account as it happens.

## Desired outcome

- A loop runs for every merchant who turns it on, with nobody watching:
  - **Observe.** Events arrive as they happen: Fourthwall webhooks for orders, order status (production, shipping, delivery, cancellation) and product changes, and Meta webhooks for ad and ad account status. Meta insights are polled every 15 minutes, which is how often Meta refreshes them, and only while a campaign is running. Every source the merchant has is read and kept apart: Fourthwall orders, customers and analytics reports (sales over time, by source and by UTM, sessions by source, conversion rates, top products, AOV, visitors, profit), Meta insights, Qloo and Tavily trend and competition shifts in the merchant's niches, and wovain's own records of designs, ads, runs and past outcomes.
  - **Reconcile.** Fourthwall's net sales (orders minus refunds and cancellations) are the count that decisions use. Meta-reported purchases are a signal. When the two disagree past a threshold on settled data, no kill action may run until they agree again or the merchant says why.
  - **Diagnose.** A structured diagnosis per finding: what happened, the likely cause, the evidence and its source, and a confidence label, in the shape of claude-ads' `explain_poor_results` job. Findings cover ads (no clicks, clicks with no sale, fatigue) and operations (fulfillment delays, refunds and returns, shipping problems, out-of-stock or discontinued blanks and colors, production errors, chargebacks).
  - **Decide.** A ranked list of next-best actions: kill or scale an ad or a whole design, pause ads for a product that can't ship, flag a design with high refunds for a quality check, refresh the creative with new hooks from Tavily and Qloo, move budget, change the audience, adjust the price or offer a bundle, start an A/B test. Each carries an expected impact and a risk.
  - **Act.** Safe actions apply on their own inside guardrails the merchant sets (budget caps, most change per day, autonomy level), once the merchant opts in. Risky ones wait for approval in the in-chat inbox.
  - **Measure.** Each applied action is checked after its window against the numbers saved when it ran.
  - **Learn.** A per-merchant memory of what worked (hooks, angles, audiences, designs, blanks, price points) feeds research scoring and ad generation, which closes the loop with autopilot (#22).
- Each event becomes a Cloud Task for that merchant, debounced so a burst of twenty orders produces one review. Webhook endpoints verify signatures and are idempotent.
- Decisions run on NVIDIA Nemotron through Nebius Token Factory, through the existing Genkit layer (`lib/ai.ts`), as the hackathon requires. Money math, thresholds, reconciliation and guardrails are deterministic code, ported from claude-ads' `ads-math` and budget guidance.
- Queues, scheduler jobs and the Meta app's webhook subscription are declared in `infra/`. State, events, diagnoses, actions and outcomes are zod-checked Firestore records under `users/{uid}/optimization/...`. Each merchant has a cost and rate limit.
- The merchant sees an optimization report (what happened, why, what wovain did, what it recommends, how past actions turned out), a settings section for guardrails and autonomy, and an inbox count on every wovain tool result when something needs them.
- claude-ads' skills are reused, not rewritten: vendored unchanged through the `skills` CLI, with a print-on-demand overlay that adds wovain's economics, operations and Fourthwall measurement. claude-ads is MIT and is credited in a NOTICE, as `spec.md > Development Tooling` already promises.

## Constraints

- **Money.** The optimizer never activates a campaign the merchant hasn't launched, never deletes anything (claude-ads' destructive-action boundary), and never moves a budget past the merchant's cap. Anything that spends fal credits (new videos), changes what shoppers see (price, bundle, promotion), or resets Meta's learning (audience change, new ad set) waits for approval.
- **Merchant accounts.** Every Meta, Fourthwall and fal call uses the merchant's own grant from #19 (`lib/connections.ts`, `lib/upstream.ts`). Meta connects through wovain for Meta app testers only until App Review (#19 chunks 6 to 8). Before a merchant has a Meta grant, the optimizer advises from Fourthwall data plus the numbers the host agent passes in, and receives no Meta webhooks.
- **Platform services.** Nebius, Tavily and Qloo stay operator-paid, under #19's per-user quotas plus a per-merchant optimizer budget. Trend checks are cached per niche so merchants in the same niche share one search.
- **Webhooks are a fast path, not the record.** Fourthwall says delivery is at least once and not guaranteed, and has no refund, chargeback or blank-catalog events; Meta's ad webhooks say something changed and leave the details to an API read. A reconciliation poll fills the gaps, so a missed webhook delays a decision and never changes it.
- **Ownership.** This work doesn't edit the connections and Meta files, `tools/design.ts`, `tools/ads.ts` or the widgets while other agents own them. Where it needs them (the Meta provider, the creative pipeline, widget changes), the plan names the hand-off.
- **Vendor files stay pristine.** claude-ads files are copied byte for byte and checked against a lock file; wovain's changes live in its own overlay.
- **Third-party text is data.** Webhook payloads, Meta insights, Fourthwall reports, Tavily and Qloo results are passed to Nemotron as untrusted JSON and never followed as instructions.
- No migrations: new records parse with zod on read, and old settings documents still parse through defaults.
- App Hosting runs on Cloud Run with CPU throttled after a response, so no work runs after a request returns (same finding as #22). A webhook handler stores the event, enqueues a task and returns.

## Decisions

The owner settled these on 2026-10-22:

1. **Real time.** Event-driven on Fourthwall and Meta webhooks, with Meta insights polled at Meta's own refresh cadence while campaigns run. The hourly guard and daily-only review are gone.
2. **Operations are in scope**, as inputs (fulfillment delays, refunds and returns, shipping problems, out-of-stock or discontinued blanks and colors, production errors, chargebacks) and as actions (pause ads for a product that can't ship, flag a design for a quality check).
3. **No single source is trusted.** Fourthwall's real sales count first, Meta's purchases are a signal, and disagreement blocks kill actions.
4. **Default autonomy** is `advise` until the merchant opts in to `safe`.
5. **Notifications**: the in-chat inbox only. No email digest.
6. **Kill rules** apply only to settled data: Fourthwall's within an hour, Meta's attribution after 72 hours.
7. **Meta's own rules stay on** as a safety net next to the optimizer.
8. **Vendored claude-ads skills are committed** under `.agents/skills/`.
9. **Prices and bundles** are always approved by the merchant.

## Open questions

1. **Fourthwall webhook registration.** Fourthwall's `POST /open-api/v1.0/webhooks` takes an OAuth token with `webhook_write`, or Basic auth. Whether the token from #19's MCP connection (`mcp.fourthwall.com/app`) works on that API is unverified; chunk 1 tests it. If it doesn't, the choice is a Fourthwall Platform App (a second OAuth grant with `webhook_write`, signed with the app's own HMAC key) or polling only. Recommended: Platform App, and poll until it exists.
