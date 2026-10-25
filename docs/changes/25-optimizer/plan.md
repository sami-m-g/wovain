# Plan: Optimization agent, a per-merchant loop that diagnoses, acts, measures and learns

Paused 2026-10-25: code removed from main in [!80](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/80), plan kept. Leftover data: see [intent.md](intent.md).

Spec: [spec.md](spec.md)

This is a `priority::1` feature that changes ad spend, stored record shapes and infra, so it stops here for a human to approve this plan. Revised on 2026-10-22 for the owner's decisions (intent.md): event-driven instead of hourly, operations in scope, and every data source reconciled with Fourthwall's sales first. It ships as ten MRs. None edits the connections or Meta files (`lib/connections.ts`, `lib/upstream.ts`, `lib/oauth-client.ts`, `lib/meta-graph.ts`, `tools/connections.ts`), `tools/design.ts`, `tools/ads.ts` or `apps/widgets/` while other agents own them; chunks that need those name the hand-off.

## Dependencies

| Needs | From | Blocks |
| --- | --- | --- |
| Fourthwall grant and `upstream.call` | #19 (merged, 0.20.0) | Nothing |
| A Fourthwall token with `webhook_write` | #19's MCP token (verified in MR 1) or a Fourthwall Platform App | Fourthwall webhooks; polling covers the gap |
| Meta through wovain (`meta_ads` provider), Graph on the merchant's token, Meta app id and secret | #19 chunk 7; App Review (chunk 8) for non-testers | MR 7 (Meta webhooks, insights polling, Meta writes); check-in mode works before |
| Live campaigns with wovain ad names and UTM tags | Slice 4 campaign step, #22 MR 5 | Real data; fixtures cover the build |
| `lib/tasks.ts` (Cloud Tasks enqueue and OIDC verify) | #22 MR 2 | MR 1 writes it if #22 hasn't |
| Creative pipeline on the merchant's fal | `tools/ads.ts` owners | MR 10's refresh apply; the brief ships before |
| Widget changes | `apps/widgets` owners | MR 9 (hand-off or wait) |
| `lib/qloo.ts` | #21 | Qloo half of trend checks and hooks; Tavily works without it |

## Files that change

- `.agents/skills/ads*/` (new, vendored unchanged), `skills-lock.json`: the ten claude-ads skills pinned by hash.
- `.agents/skills/wovain-pod-ads/` (new): `SKILL.md` and `references/{economics,kills,creative,operations,seasonality,measurement,reconciliation}.md` with the POD and R rule IDs.
- `NOTICE` (new): claude-ads MIT text, copyright, version, adapted files.
- `scripts/skills-check.ts` (new, only if `skills` has no verify command) and `package.json`: `skills:check` in `pnpm check`.
- `packages/shared/src/optimizer/` (new): `events.ts` (Fourthwall and Meta payload schemas, the stored event shape, idempotency keys), `snapshot.ts`, `records.ts` (state, hooks, event, run, finding, diagnosis, action, outcome, memory, inbox), `ledger.ts` (net sales), `reconcile.ts` (R1 to R5 and their blocks), `math.ts` (ads-math formulas), `pod.ts` (economics, kills, creative, seasonality, measurement), `ops.ts` (stock, refunds, fulfillment, production, shipping, chargebacks), `menu.ts` (candidate actions with impact, risk, window, rollback), `guardrails.ts` (clamps, settle checks, ledger checks).
- `packages/shared/src/settings.ts`: the `optimizer` group and its patch schema.
- `packages/shared/src/rules.ts`: unchanged; the optimizer imports `ruleThresholds` and `adName`.
- `apps/server/src/routes/webhooks.ts` (new) and `app.ts`: `/webhooks/fourthwall`, `/webhooks/meta`.
- `apps/server/src/optimizer/` (new): `store.ts`, `intake.ts` (verify, route, store once, debounce), `register.ts` (Fourthwall webhook and Meta `subscribed_apps` on enable), `observe.ts` and `sources/{fourthwall,meta,trends,wovain}.ts`, `triage.ts`, `diagnose.ts`, `decide.ts`, `act.ts`, `measure.ts`, `memory.ts`, `guidance.ts`, `allowlist.ts`, `quota.ts`, `run.ts` (lease and step machine).
- `apps/server/src/lib/ai.ts`: `models.optimizer`.
- `apps/server/src/lib/tasks.ts` (new, or from #22) and `apps/server/src/routes/tasks.ts`: `/tasks/optimizer/run`, `/tasks/optimizer/poll`, `/tasks/optimizer/daily`.
- `apps/server/src/tools/optimizer.ts` (new) and `server.ts`: the five tools.
- `apps/server/src/playbooks/optimize.ts` (new) and `playbooks/index.ts`: the playbook, the `optimize` step and prompt, the inbox line in `instructions`.
- `apps/server/src/env.ts`, `.env.example`, `apphosting.yaml`: `WOVAIN_OPTIMIZER`, `WOVAIN_OPTIMIZER_QUEUE`, `WOVAIN_OPTIMIZER_DEBOUNCE_SECONDS`, `META_WEBHOOK_VERIFY_TOKEN` (and `FOURTHWALL_APP_HMAC_KEY` if the Platform App path is taken).
- `apps/server/firestore.indexes.json`, `firebase.json`: the `optimizerDue` and events indexes, TTL fields.
- `infra/tasks.ts` (new), `infra/meta.ts` (new, MR 7) and `infra/index.ts`: queue, two scheduler jobs, service account and IAM, APIs, secrets, the Meta app's `ad_account` webhook subscription.
- `apps/widgets/src/optimization/` (new, MR 9, by or with the widget owners): report widget and stories; the Settings widget's Optimizer group.
- `docs/prd.md`, `docs/spec.md`, `docs/scope.md`, `docs/checklist.md` (slice 6 rewritten), `docs/app-map.html`, `README.md`: the optimizer as the step after launch, its webhooks and polling; the Non-Goals row "A custom media-buying engine" reworded, since the optimizer advises and acts inside Advantage+ rather than replacing it.

## Order of work

MRs 1, 2 and 3 have no dependencies on each other and can run in parallel. Size: S is a day or less, M about two days, L three or more.

1. **MR 1: Event intake and the task backbone (M).** The new core of the design and its biggest unknown, so it goes first.
   - Verify first, record in `verify.md`: does #19's Fourthwall token call `GET /open-api/v1.0/webhooks`, and `POST` with `webhook_write`? If not, open the Platform App question on #25 and build the poll path in MR 4 as the only path until it's answered.
   - `lib/tasks.ts` (or #22's), with `ALREADY_EXISTS` as success and the in-process version for dev and tests.
   - `routes/webhooks.ts` and `optimizer/intake.ts`: raw-body HMAC checks for both Fourthwall headers and Meta's `X-Hub-Signature-256`, Meta's `GET` challenge, routing through `fourthwallShops` and `metaAdAccounts`, `create()`-once event storage with PII dropped, the debounced named task.
   - `optimizer/register.ts` for Fourthwall (webhook created on enable, secret encrypted with `lib/cipher.ts`, removed on disable).
   - `/tasks/optimizer/run` with OIDC check and the lease, doing only "mark events processed" for now.
   - `infra/tasks.ts`: the `optimizer` queue, the `tasks-invoker` account and IAM, APIs, env in `apphosting.yaml`; `pulumi preview` in the MR.
   - Tests: bad or missing signature gets 401 and stores nothing; the same event twice stores one; 20 orders in one window make one task; a Meta batch with mixed accounts routes each change; an unknown shop gets 404; an invalid OIDC token gets 401; lease contention re-enqueues.
2. **MR 2: Vendor claude-ads and write the POD overlay (S, no runtime code).**
   - `skills add` the ten skills into `.agents/skills/`, commit them unchanged, pin them in `skills-lock.json`.
   - `skills:check` in `pnpm check` and CI.
   - `wovain-pod-ads` overlay with every rule ID from spec section 4 and the R checks from section 3.
   - `NOTICE`.
3. **MR 3: Shared schemas and deterministic rules (L, pure, no I/O).**
   - `events.ts`, `snapshot.ts`, `records.ts`, `ledger.ts`, `reconcile.ts`, `math.ts`, `pod.ts`, `ops.ts`, `menu.ts`, `guardrails.ts`, the settings group.
   - The overlay-to-code test (every rule ID has code or guidance).
   - Unit tests with fixture snapshots for each rule: net sales with refunds and chargebacks, each R check and the kill block it sets, every POD rule including the operations ones, each action's expected impact (base and downside), each guardrail and settle check.
4. **MR 4: Observe and reconcile on Fourthwall, with polling (L).** Needs MRs 1 and 3.
   - `store.ts`, `observe.ts`, `sources/fourthwall.ts` (orders, cancellations, payout transactions, unfulfilled orders and fulfillment detail, catalog blanks, analytics reports cached an hour), `sources/wovain.ts` (designs, ads, campaign, autopilot runs, past runs and outcomes), `sources/trends.ts` (Tavily now, Qloo when #21 lands, `trendCache` per niche).
   - `/tasks/optimizer/poll` and `/tasks/optimizer/daily`, the `optimizerDue` index with `activeUntil`, the two scheduler jobs in `infra/tasks.ts`.
   - `triage.ts`: findings and reconciliation blocks, code only, saved as open or closed.
   - Verify and record: whether refunds carry a reason, whether chargebacks show in payout transactions, Fourthwall production times per blank from `omni_knowledge`.
   - Integration tests on the emulators with a stubbed upstream: an order webhook updates the ledger; a refund found by the poll reverses a sale; a blank going out of stock raises `blank_out_of_stock`; a missed webhook is caught by the poll; polling stops after 24 idle hours and the daily sweep still runs.
5. **MR 5: Diagnose and decide on Nemotron (M).**
   - `models.optimizer`, `guidance.ts`, N1 and N2 with zod replies, code caps on confidence, menu filtering, the code-only fallback, no model call when triage finds nothing new.
   - `optimizer_review` (check-in mode: host-passed Meta insights) and `optimizer_status` with each source's numbers, plus the `optimize` playbook.
   - Unit tests with `mockModel`; one manual Nemotron run on fixture snapshots recorded in `verify.md`.
   - First usable result: "how's my campaign?" returns a diagnosis and ranked advice from Fourthwall's real sales and operations, plus Meta numbers the host agent passes. #5 closes here.
6. **MR 6: Act, approvals and undo (M).**
   - `act.ts` with precondition, idempotency, settle check, ledger and guardrails; `allowlist.ts`; `optimizer_decide` and `optimizer_undo`; the inbox and its count on every tool result.
   - Meta writes only on a `meta_ads` grant; check-in mode returns approved actions for the host agent. `autonomy` stays `advise` unless the merchant changes it.
   - Allowlist test: no activation, delete or order tool reachable; `ACTIVE` only on ads wovain paused; price and bundle tools only from an approved action.
7. **MR 7: Meta live (M).** Needs #19 chunk 7.
   - `infra/meta.ts`: the app's `ad_account` subscription (`effective_status`, `with_issues_ad_objects`, `in_process_ad_objects`, `creative_fatigue`, `ad_recommendations`) through `magodo/restful`, and the verify token secret.
   - `register.ts` for Meta: `POST /act_{id}/subscribed_apps` on enable with the merchant's token.
   - `sources/meta.ts` on the grant: structure, 15-minute insights while active, signal health. Verify and record which Meta Ads MCP tool gives daily ad-level rows, Graph insights on the #19 token, and whether insights-threshold subscriptions work.
   - Tests: an `effective_status` webhook to active starts polling, to paused with nothing else running stops it; a disagreement between Meta purchases and net sales blocks a kill end to end.
   - Manual: one tester account on `advise`, then one on `safe` with a paused test campaign.
8. **MR 8: Measure and learn (M).**
   - `measure.ts` (windows, refunds re-read at the end, control, labels, rollback of a worse safe action), `memory.ts` (features including blank and refund rate, decayed Beta score), `getLearnings`.
   - Hand-off to #22: autopilot's D1 and D7 and its weight refit read `getLearnings`. A short note in #22 names the function; the autopilot owner wires it.
9. **MR 9: Merchant view and docs (M).**
   - The report widget (sources strip, operations section) and the Settings Optimizer group with webhook status, with stories in every state, light and dark (with the widget owners).
   - `show_optimization_widget`.
   - Planning docs listed above, checklist slice 6 rewritten as the optimizer.
10. **MR 10: Creative refresh, tests, price and bundle (M).**
    - N3 hooks from Tavily, Qloo and memory, with #22's D7 limits.
    - Approved refresh runs the ads pipeline on the merchant's fal (with the `tools/ads.ts` owners); `ab_test` through `ads_experiment_abtest_create_test`; `price_change` and `bundle_offer` through Fourthwall, approval only.

MRs 1 to 6 give a working optimizer on Fourthwall events and polls with Meta in check-in mode. MR 7 turns on Meta's half once #19's Meta grant exists; until then nothing in MRs 1 to 6 waits for it.

## Risks

| Risk | How we'll notice | Response |
| --- | --- | --- |
| #19's Fourthwall token can't register webhooks | MR 1's first check | Poll every 15 minutes while active (MR 4), ask the owner about a Fourthwall Platform App; decisions are the same, only slower |
| #19 chunk 7 or App Review slips | No `meta_ads` grants | Check-in mode covers the demo; MR 7 waits. MRs 1 to 6 don't need it |
| Webhooks lost or delayed | Poll finds events the webhooks didn't deliver (`source: "poll"` counts in run records) | The poll is the record; webhooks only make it faster |
| A burst floods the queue | Runs per merchant near the daily limit | Fixed debounce window, one task per window, triage before the model, daily run cap |
| The Meta Ads MCP has no raw daily ad-level insights | MR 7 verification | Graph insights on the merchant's token; failing that, `ads_insights_performance_trend` at lower resolution, with lower confidence |
| A false kill on lost purchases | An outcome labeled `worse` after a pause, a merchant Undo | Net sales first, both sources settled, R1 and R2 blocks, Undo, `advise` by default |
| Sources disagree most of the time and kills never run | Blocks open in most runs | The report shows why; `fix_tracking` points at CAPI and UTM setup; Meta's own rules still act as the safety net |
| Fourthwall lacks refund reasons or chargeback data | MR 4 verification | POD-O2 runs on refund counts alone; chargebacks only from what payout transactions show, labeled |
| Nemotron diagnoses weakly or off-schema | Fallbacks counted in run records; low agreement in the fixture check | Code-only fallback; tighten prompts in MR 5 before MR 6 applies anything |
| Two systems act on one ad (Meta rules and the optimizer) | Rule history shows an action the optimizer also proposed | Read rule history and `effective_status` first; the report names which system acted |
| Too few sales to measure anything | Most outcomes `inconclusive` | Expected for small shops; the report says so, and memory only updates on labeled outcomes |
| Cost per merchant grows with ads and events | Quota hits in run records | Per-merchant limits, polling only while active, shared trend cache, operator switch |
| Vendored skills drift on update | `skills:check` fails | Update by re-running `skills add` at a new version in its own MR, never by editing |
| Ownership collisions | Merge conflicts with #19, #22 or widget work | The file list keeps out of owned files; hand-offs named in MRs 6, 8, 9 and 10 |

## Tests that prove it

- Unit (`pnpm test`):
  - signature checks for both Fourthwall headers and Meta, with the raw body, wrong secret, missing header and a re-serialized body;
  - idempotency keys for Fourthwall event ids and Meta changes;
  - the ledger (orders, refunds, cancellations, chargebacks) and every R check with the kill block it sets;
  - every POD rule on fixture snapshots (ad versus design kill, unsettled spend, fatigue, size mix, bundle math, refunds in contribution, can't ship, refund spike, fulfillment delay, production error, shipping and chargeback alerts, seasonal stop, niche trend, UTM attribution, missed sale);
  - `math.ts` against hand-computed cases, including zero sales and zero spend;
  - every guardrail and hard limit (cap, change per day, cooldown, pauses per day, settle windows, price floor, no last-ad pause, no kill under a block);
  - the allowlist has no activation, delete or order tool;
  - menu filtering of model replies, confidence caps, the code-only fallback, triage skipping the model;
  - the overlay-to-code rule ID check.
- Integration (`pnpm test:integration`, emulators):
  - a signed order webhook stores once, enqueues one task per window, and the run updates the ledger;
  - a burst of 20 orders makes one run; a duplicate delivery makes none;
  - a poll catches a refund and an order the webhooks missed;
  - an out-of-stock blank proposes `pause_product_ads` under `advise` and applies it under `safe`;
  - Meta purchases disagreeing with net sales block `pause_ad`;
  - approve, dismiss, expire, undo; a stale precondition cancels an action;
  - measure after the window and update memory;
  - poll and daily fan-out, double tick, lease contention, an invalid OIDC token gets 401.
- Stories: the report widget in advise, safe, check-in, sources disagree, operations alert, empty and limit reached, light and dark, with the a11y addon.
- Checks: `pnpm check` (with `skills:check`), `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pulumi preview`.
- Manual (in `verify.md`): Fourthwall's test webhook delivered to the deployed endpoint and stored once; one check-in review on the owner's live campaign that returns cleanly; one fixture review on Nemotron with its replies; once Meta connects for testers, an `effective_status` webhook received, then one run on a tester account with `advise`, then one with `safe` on a paused test campaign.
