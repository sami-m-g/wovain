# Plan: Remove or wire the settings nothing reads

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/rules.ts`: honor `alertAboveBreakeven`, add `activeRuleLabels`.
- `packages/shared/src/settings.ts`: drop `metaSettings`.
- `apps/server/src/tools/campaign.ts`: honor `tagUtmContent`; the widget uses active labels.
- `apps/server/src/tools/settings.ts`: description drops "Meta".
- `apps/server/src/env.ts`, `package.json`: drop `WOVAIN_MOCK` and `mock`.
- `apps/server/src/playbooks/campaign.ts`: tags are optional.
- `apps/widgets/src/settings/fields.ts`, `settings-widget-view.tsx`: drop the Meta section.
- Tests and `docs/spec.md`.

## Order of work

1. Failing tests: Alert off, UTM off, old `meta` record parses.
2. Fix `rules.ts` and `campaign.ts`.
3. Delete the dead settings, env flag, script and widget section.
4. Docs.

## Risks

Low. Not an auth, infra, money or record-shape change (the removed fields were never read). Tests and `pnpm knip` catch leftovers.

## Tests that prove it

`campaign-tools.test.ts` (Alert off, UTM off), `store.test.ts` (old record, env). Then the full check set.
