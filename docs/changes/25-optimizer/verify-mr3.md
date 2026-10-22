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
