# Plan: Autopilot, one command from idea to a paused Meta campaign

Spec: [spec.md](spec.md)

This is a `priority::1` feature that spends money, so it stops here for a human to approve this plan. It's several MRs. Each MR below builds on the one before, and none touches `lib/connections.ts` or `lib/upstream.ts` (#19 owns them).

## Dependencies

| Needs | From | Blocks |
| --- | --- | --- |
| `upstream.call({ userId, id, tool, args })` for Fourthwall and fal, and the `needsConnection` outcome | #19 chunks 2 and 4 | MR 3 onwards |
| Server-side `upload_artwork` (Fourthwall upload link + PUT) | #19 chunk 5 | MR 4 |
| Meta through wovain (`meta_ads` provider), `create_rules` on the merchant's grant, `ads_library_search` | #19 chunk 7 (Meta app testers only until App Review, chunk 8) | MR 5's Meta steps and the Ad Library signal |
| Per-user quotas on Nebius, Tavily and Qloo calls | #19 (rate-limits chunk) | Open sign-up only; autopilot can ship behind the opt-in setting first |
| Server-side art generation with judge and copyright check | #4 | Merged into MR 3: `lib/artwork.ts` serves both |

## Files that change

- `packages/shared/src/autopilot.ts` (new): input schema, run and event record schemas, the D1 to D8 reply schemas, run statuses, the widget data.
- `packages/shared/src/settings.ts`: `autopilot` group with `enabled` (default false), `maxRevisions` (2), `weights`, `aiDisclosure` (`OPT_IN`), `defaultMaxSpend` (5). Old records parse through defaults.
- `apps/server/src/lib/qloo.ts` (new): tag search and insights over `fetchJson`, zod-checked, `undefined` without `QLOO_API_KEY`.
- `apps/server/src/lib/competition.ts` (new): the marketplace Tavily search (reusing `searchWeb` from `lib/tavily.ts`), the price extraction decision, median and range; the Ad Library read when a Meta grant exists.
- `apps/server/src/lib/artwork.ts` (new, shared with #4): GPT Image 2.5 request builder, the submit and poll pair over the fal grant, the alpha check (reusing `lib/image.ts`), staging into Cloud Storage.
- `apps/server/src/lib/autopilot/decisions.ts` (new): D1 to D8 prompts and their code limits, each a pure function plus one `generateObject` call.
- `apps/server/src/lib/autopilot/steps.ts` (new): the step table (name, paid estimate, run function, output key) and the allowlist of upstream tools autopilot may call.
- `apps/server/src/lib/autopilot/flow.ts` (new): `ai.defineFlow("autopilotStep")`, the time-boxed loop, stop and cap checks, the event log.
- `apps/server/src/lib/autopilot/queue.ts` (new): `enqueue` and `verify` over `@google-cloud/tasks` and `google-auth-library`, plus the in-process version for dev and tests.
- `apps/server/src/store.ts`: `autopilotRun` and `autopilotEvent` kinds; `hidden` design status.
- `apps/server/src/tools/autopilot.ts` (new): `autopilot`, `autopilot_status`, `autopilot_stop`, `autopilot_resume`, `show_autopilot_widget`.
- `apps/server/src/routes/tasks.ts` (new) and `app.ts`: `POST /tasks/autopilot`, OIDC-checked.
- `apps/server/src/lib/ai.ts`: `models.autopilot` (Nemotron 3 Super). Nothing else changes there.
- `apps/server/src/env.ts`, `.env.example`, `apphosting.yaml`: `WOVAIN_AUTOPILOT`, `WOVAIN_TASKS_QUEUE`, `WOVAIN_TASKS_SA`; `QLOO_API_KEY` listed once it has a value.
- `apps/server/src/playbooks/autopilot.ts` (new) and `playbooks/index.ts`: the short host-side playbook and the `instructions` line. The "Nothing is published or spends money without the merchant's approval" sentence gains "except in autopilot, which the merchant turned on".
- `apps/widgets/src/autopilot/` (new): the run-status widget and its stories.
- `infra/index.ts` (or a new `infra/tasks.ts`): the Cloud Tasks queue, the task service account and its IAM, `cloudtasks.googleapis.com` enabled, the `wovain:autopilot` config value.
- `docs/prd.md`, `docs/spec.md`, `docs/scope.md`, `docs/checklist.md`, `docs/app-map.html`, `README.md`: autopilot as a second way through the journey; the four PRD statements in the intent's Constraints; keys and costs.

## Order of work

1. **MR 1: Records, settings and decisions (no upstream calls).**
   - Shared schemas and settings.
   - `decisions.ts` with D1 to D8 and their code limits.
   - Vitest with a stubbed `generateObject`: every limit (price floor, budget cap, trademark hit fails, revision cap, IP name list, copy overlap, length limits) and the malformed-reply retry.
   - One manual Nemotron check of D1 and D5 replies against fixtures, recorded in `verify.md`.
2. **MR 2: Runner and queue.**
   - Run and event store with the lease, the one-run-per-user transaction and `runKey` idempotency.
   - `flow.ts` with a fake step table.
   - The queue (in-process for tests, Cloud Tasks in production) and `/tasks/autopilot` with OIDC verification.
   - `infra/` queue, service account and IAM.
   - Integration tests on the emulator: stop, cap, resume, lease contention, a retried step not re-running its side effect.
3. **MR 3: Research and art.**
   - `qloo.ts` and `competition.ts`.
   - `artwork.ts` (also closes #4's generator acceptance criteria, or links to it).
   - Steps research → D1 → D2 → generate → D3, with fal through `upstream.call`.
   - Verify one real GPT Image 2.5 run at 2400 × 3200 with transparency, and record the real charge in `verify.md` and `spec.md`.
4. **MR 4: Fourthwall product.**
   - Steps: catalog → mockups → D4 → price (D5) → trademark (D6) → offers → prices → optional PUBLIC → record.
   - Hidden by default.
   - Integration test with a stubbed upstream: no `update-offer-status` call unless `publish: "live"`.
5. **MR 5: Ads and the paused campaign.**
   - `video_plan` through fal, D7, then the Meta build in code (D8) and `create_rules`.
   - Allowlist test: no activation tool reachable.
   - Until #19 chunk 7 lands, the run ends at `needs_connection` (Meta) after the ads, and this MR ships with the Meta steps behind the grant check.
6. **MR 6: Tools, widget and docs.**
   - The `autopilot*` tools, the run-status widget with polling and Stop, stories for each state.
   - The playbook, and the planning docs listed above.
   - The end-to-end demo run on a tester account, recorded in `verify.md`.
7. **Later (with #5):** the learning loop: outcome reads, weight refits, kill and scale on designs.

## Risks

| Risk | How we'll notice | Response |
| --- | --- | --- |
| #19 slips, so there are no merchant grants to call through | MR 3 can't run end to end | MRs 1 and 2 don't need them. MR 3 can test against a stubbed `Upstream` until #19 merges |
| Meta App Review blocks non-testers | Run ends `needs_connection` (Meta) | Expected. Products and ads are still done, and the summary says what's left |
| App Hosting's undocumented request timeout is short | Task 504s in Cloud Tasks logs | Steps are time-boxed to about 45 s, and slow work is split into submit and poll |
| Nemotron replies off-schema or weakly | zod failures in the event log, low D1 agreement in the fixture check | One retry at temperature 0, then the step fails visibly. Tighten the prompts in MR 1 before wiring |
| GPT Image 2.5 drops the alpha at custom sizes, or costs more than estimated | `verify.md` run in MR 3 | Background removal fallback ($0.018). Update the cost table |
| Tavily snippets rarely carry prices | Empty price lists in D5 events | D5 falls back to the quote minimum, logged as "no competitor prices found" |
| Qloo key or quota missing in production | `configured: false` for Qloo | D1 runs without the demand signal (weight redistributed), logged |
| Merchant surprise at fal spend | Support questions | Opt-in setting, cap shown before start, spend in the widget, Stop |
| Two tasks run the same run | Duplicate offers or campaigns | The lease plus saved upstream IDs. Integration test in MR 2 |

## Tests that prove it

- Unit (`pnpm test`):
  - each decision's limits;
  - the allowlist has no activation tool;
  - `publish` defaults to hidden;
  - the budget clamp;
  - the price floor;
  - the trademark fail;
  - the revision cap;
  - cost-cap arithmetic;
  - `runKey` hashing.
- Integration (`pnpm test:integration`, emulators):
  - a full run with stubbed upstream, Nemotron and queue reaches `done`, with products hidden, the campaign created paused and every event stored;
  - stop mid-run;
  - the cap reached;
  - resume after `needs_connection`;
  - a duplicate `runKey`;
  - lease contention;
  - an invalid OIDC token gets 401.
- Stories: the run-status widget in running, needs connection, capped, failed and done, light and dark, with the a11y addon.
- Checks: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `pulumi preview` for the queue.
- Manual (in `verify.md`): one real run on the owner's tester accounts. It needs:
  - a Fourthwall product hidden in the shop;
  - a paused campaign visible in Ads Manager with its ads and rules;
  - the run's fal charge under `maxSpend`;
  - every decision with its reasoning in `autopilot_status`.
