# Verify: Remove or wire the settings nothing reads

## Tests added

- `campaign-tools.test.ts`, "turning off alertAboveBreakeven creates no Alert rule": failed first (Alert was still built and listed in the widget).
- `campaign-tools.test.ts`, "turning off tagUtmContent leaves the URL tags out of the plan": failed first.
- `store.test.ts`, "saved settings with the removed meta group still parse": guards old Firestore records.
- `store.test.ts` env test no longer asserts `WOVAIN_MOCK`.

## Checks run

`pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test` (53), `pnpm test:integration` (40) and `pnpm build`: all pass.

## Review findings

The `pr-review-toolkit` agents are not installed in this environment, so four general-purpose agents reviewed the diff for reuse, simplification, efficiency and altitude.

- Reuse, efficiency: clean.
- Simplification: the Alert rule's conditional spread needed four `as const` casts. Fixed: the rule is a plain object and `metaRules` filters on a shared `isActive` predicate, which `activeRuleLabels` also uses.
- Altitude: the Alert toggle was decided in two places. Fixed by the same shared predicate. Making `metaRules` the sole source for the widget was skipped as a larger refactor with no behavior change.
- `docs/checklist.md` item 7 still mentions mock mode. It describes planned future work, so it is left as is.

## Try it

1. In Settings > Rules, turn off "Alert when cost per sale passes breakeven" and "Tag ad links with utm_content".
2. Run the campaign playbook: `campaign_plan` has no `urlTags`, `create_rules` makes four rules, and the campaign widget lists four.
3. The Settings widget no longer has a Meta section.

## Departures from the plan

None. The `feature-dev` architect agent was not used: the change is small and follows existing patterns.
