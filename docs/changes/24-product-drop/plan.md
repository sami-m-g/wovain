# Plan: Turn one idea into a priced multi-product drop on Fourthwall

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/design.ts`: product, range and drop fields; `lowPrints`, `dropTotals`.
- `apps/server/src/lib/art-plan.ts` (new): fal request per art piece.
- `apps/server/src/lib/publish-design.ts` (new): publish sequence and reply parsing.
- `apps/server/src/tools/art.ts` (new): `generate_art`.
- `apps/server/src/tools/design.ts`: server-side pricing in `show_design_widget`, `publish_design`.
- `apps/server/src/server.ts`: pass `upstream` to the design tools, register the art tool.
- `apps/server/src/playbooks/design.ts`, `playbooks/index.ts`: the drop flow.
- `apps/widgets/src/design/*`: drop cards, totals, extra placements; reprice through `show_design_widget` alone; stories.
- `apps/widgets/.storybook/public/mockups/`: synthetic mockups for the other product types.
- Tests: `test/unit/publish-design.test.ts`, `test/unit/art-plan.test.ts`, `test/unit/economics.test.ts` (drop totals), `test/integration/design-tools.test.ts`.
- Docs: `docs/prd.md`, `docs/spec.md`, `docs/app-map.html` where they describe the design step.

Added after the security review (see verify.md):

- `apps/server/src/lib/approval.ts` (new): content hash, approve (server-side only), claim, release, reject.
- `apps/server/src/lib/browser-confirm.ts` (new) and `apps/server/src/routes/confirm.ts` (new): the out-of-band confirmation (single-use link, AuthKit sign-in in the browser bound by a cookie, summary page, same-site Confirm POST with a single-use secret). Reusable for other confirmations.
- `apps/server/src/tools/publish.ts`: `approval_link` and `publish_design` (moved out of `tools/design.ts`).
- `apps/server/src/store.ts`: `replaceDesign`, a transactional read-and-replace.
- Wiring: `runtime.ts`, `app.ts`, `http.ts`, `routes/mcp.ts`, `server.ts`; `lib/oauth-client.ts` lists `/confirm/callback` in wovain's client metadata.
- `record_design` accepts only `rejected` and `skipped`.
- Tests: `test/integration/confirm.test.ts`; approval tests in `design-tools.test.ts`; `connect.test.ts` expects the new redirect URI.

## Order of work

1. Shared schema and helpers.
2. Art plan and `generate_art`.
3. Server pricing in `show_design_widget`; `publish_design` with its lib.
4. Playbook.
5. Widget and stories.
6. Tests, docs, checks, reviews, `verify.md`, MR.

## Risks

- Fourthwall's reply shapes aren't documented beyond the tool descriptions. The parser looks for the fields anywhere in the reply, in structured content or JSON text; a miss records a clear rejection instead of a silent success.
- A long publish (one minute per design inside `create-offers-from-designs`) could hit a host timeout. Offer ids are saved first, so a retry continues.

## Tests that prove it

- Unit: publish order, prices, collection only for a drop, retry skips created offers, refusal surfaces the reason; art requests per shape and with references; drop totals.
- Integration: server-side quotes on the hero and every range product; `publish_design` refuses a draft; old records parse.
- Stories: drop draft, drop with a low print, drop live, drop in dark.
- `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `build`, `test:stories`.
