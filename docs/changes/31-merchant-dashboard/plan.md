# Plan: Merchant dashboard

Spec: [spec.md](spec.md)

This is a `priority::1` feature, so the plan would stop for approval; the owner waived that checkpoint for this issue. It spends no money and adds no stored record shape (it only reads).

## Files that change

- `packages/shared/src/dashboard.ts` (new), `packages/shared/src/widgets.ts` (`dashboard`), `packages/shared/package.json` (export).
- `apps/server/src/lib/reply-json.ts` (new, from `fal-media.ts`), `lib/report-rows.ts` (new), `lib/dashboard.ts` (new), `lib/fal-media.ts`.
- `apps/server/src/tools/dashboard.ts` (new), `server.ts`, `store.ts`.
- `apps/server/src/playbooks/index.ts`: a line in the instructions naming `show_dashboard`.
- `apps/widgets/src/dashboard/` (new): widget, view, chart, stories.
- Tests: `apps/server/test/unit/report-rows.test.ts`, `test/integration/dashboard-tools.test.ts`, the e2e journey and its fixtures.
- Docs: `docs/spec.md` (tools and widgets tables), `docs/data-model.md` (who reads what), `README.md` if it lists tools.

## Order of work

1. Shared schema and the row readers, with unit tests.
2. `gatherDashboard`, the cache and the two tools, with integration tests on the emulators against fake Fourthwall and Meta servers.
3. The widget and its stories.
4. The e2e step, docs, the full check set.

## Risks

- Report shapes differ from the docs: lenient readers, empty sections, flagged in the MR as unverified live.
- The widget's height grows with data: every list is capped, so it stays one screen of sections without inner scrolling.

## Tests that prove it

- Unit: the readers on structured, text-JSON and table replies; money objects; name matching.
- Integration: full data with both connections; Fourthwall only (Meta card); nothing connected; a failing upstream marks `error` and keeps the rest; the cache returns the same object within 60 s for the same merchant and not for another; optimizer actions show when present; bad range refused.
- Stories: loading, empty, partial connections, full data, in light and dark, with play tests and a11y.
- E2E: `show_dashboard` after the campaign step.
