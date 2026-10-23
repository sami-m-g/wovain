# Verify: MR 3, shared schemas and deterministic rules (#25)

Pure code in `packages/shared/src/optimizer/`, no I/O. Nothing calls it yet: MR 4 wires the events, snapshot and ledger into the run, and MR 5 and 6 use the menu and guardrails.

## Tests added

All in `apps/server/test/unit/`, beside the other shared-package tests:

- `optimizer-events.test.ts`: Fourthwall order, order update, product stock, promotion, cart and disconnect payloads become stored fields with names, emails and addresses dropped (the email only as a per-shop hash); unreadable payloads are marked `unparsed`; idempotency keys for Fourthwall event ids, Meta changes (account, field, object, value, time) and poll events; a Meta batch is flattened with `act_` stripped and duplicates keyed alike; a delivery over 1000 changes is refused.
- `optimizer-ledger.test.ts`: net sales with refunds, cancellations and chargebacks (an order refunded then charged back loses one sale, both costs count); settle windows; `math.ts` against hand-computed cases, including zero sales and zero spend; R1 to R5 pass, fail and unknown; a failed R1 or R2 blocks kills on the entity and below it, and a block dismissed with a reason doesn't.
- `optimizer-rules.test.ts`: every POD rule on fixture facts: ad versus design kill, unsettled spend, no clicks, fatigue from the ad's own series (and only on settled days), concept count, drops, size mix (the suggested price is `priceProduct`'s floor, $37 for a $24 blank), bundle math, capped winner, campaign above breakeven, the confidence caps, seasons, shop-wide swings, tracking gap, missed sale, and the five operations rules (can't ship, discontinued color, restock, refund spike, fulfillment delay, production errors, shipping and chargebacks).
- `optimizer-menu.test.ts`: each candidate's expected impact (base and downside), precondition, window and rollback; no pause of a design's last active ad; kills dropped under a reconciliation block, a refund spike or a tracking gap while operations pauses stay; scaling stopped near a season's cutoff; price and bundle always risky; idempotency key per action per day; model ranking filtered to the menu with `hold` kept; the code-only fallback; no action type can activate, delete or touch an order; every guardrail (off, approval, budget cap and step, cooldown, pauses per day, settle windows, last ad, kill block, not launched, not ours, price floor) and the $500 hard cap; optimizer settings defaults and old documents parsing.
- `optimizer-overlay.test.ts`: every `POD-*` and `R*` heading in `.agents/skills/wovain-pod-ads/references/` has a code entry (`podRuleIds`, `opsRuleIds`, `reconcileRuleIds`), and code names no rule the overlay lacks.

## Checks run

- `pnpm check` (with `skills:check`): pass
- `pnpm typecheck`: pass
- `pnpm knip`: pass
- `pnpm arch`: pass
- `pnpm dupes`: 0 clones
- `pnpm test`: 170 passed
- `pnpm test:integration`: 92 passed
- `pnpm build`: pass

## Review findings

- The overlay from MR 2 had no `POD-B1`, which the spec's menu table uses for a capped winner. Added a `### POD-B1 Winner capped` section to `references/economics.md` and named it in the overlay's table, so the overlay test holds both ways.
- The lint caps file length at 400 lines, so the POD rules are split: `pod.ts` (ads and designs, and the rule ID list), `shop.ts` (economics, the campaign, seasons, measurement, confidence caps) and `facts.ts` (the input shapes both read).

## Try it

Nothing to try in the review app yet: no tool or route uses this code until MR 4. `pnpm test` runs it.

## Departures from the plan

- Two files the plan doesn't list: `shop.ts` and `facts.ts`, from the split above.
- Findings carry a `facts` map (the numbers the menu needs) next to their evidence, and three patterns beyond the spec's list: `unsettled_spend` (POD-K4), `over_breakeven` (the campaign `budget_down` case) and `single_concept` (POD-C2), plus `low_aov`, `restocked`, `seasonal_end`, `seasonal_cutoff` and `shop_wide` for rules the spec describes without a pattern name.
- `ab_test` and `audience_change` are action types but the menu doesn't build them yet: they need N3, Qloo and the sample math, which are MR 10.
- POD-O3's production days and POD-O5's carrier window are inputs, since they come from Fourthwall's help (`omni_knowledge`) in MR 4, not a table in code.
- The stored event's 30-day TTL field is a Firestore timestamp, so the store adds it in MR 4 rather than this zod shape.

## Follow-up: guards fail closed

A security review of MR 3 found four medium issues. Each guard now fails closed (branch `fix/25-optimizer-guards`):

1. **Budget cap.** Every `budget_up` and `budget_down` is checked against `min(maxDailyBudget, $500)`. A missing amount is a `budget_cap` violation, and a missing, zero or negative current budget is a `budget_step` violation, so neither skips the check any more.
2. **Settle check.** A kill needs settled Meta data as well as Fourthwall's. Missing Meta data used to count as settled; now it counts only when the caller passes `metaIndependent: true`.
3. **Customer key.** `customerKeyOf(secret, shopId, email)` is HMAC-SHA256 with a server-side secret instead of a plain SHA-256 of the email, which could be reversed by hashing guessed emails. `fourthwallFields(event, secret)` takes the secret as a required argument and refuses an empty one. The secret is `optimizer-customer-key` in `infra/index.ts` (`secretNames`) and `OPTIMIZER_CUSTOMER_KEY` (at least 32 characters) in `env.ts` and `.env.example`. It isn't in `apphosting.yaml` yet, because App Hosting won't build with a secret that has no value. No value was set.
4. **Operations pauses.** POD-O4 counts only fulfillments Fourthwall skipped or cancelled in production (`productionError`), never an order the buyer cancelled. `pause_product_ads` is now risky, so it waits for the merchant's approval. It also counts toward `maxAutoPausesPerDay`, together with kill pauses, and respects the cooldown.

**Departure from the spec.** Spec section 3 (the `pause_product_ads` row) and section 4 (POD-O1) call operations pauses "safe and immediate". They're still proposed at once with no settle wait, but they now need approval. The overlay (`references/operations.md`, and the ground rules in `SKILL.md`) says so.

Tests added:

- `optimizer-events.test.ts`: the HMAC key differs from the plain hash and changes with the secret and the shop; an empty secret throws.
- `optimizer-rules.test.ts`: buyer cancellations never count as production errors.
- `optimizer-menu.test.ts`:
  - a budget move with a missing amount, or a missing, zero or negative budget, is refused;
  - the cap holds without a current budget;
  - a kill without Meta data is unsettled unless `metaIndependent` is set;
  - operations pauses need approval and share the pause cap and the cooldown.
