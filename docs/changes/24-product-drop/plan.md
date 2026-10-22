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
