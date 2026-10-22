# Spec: Remove or wire the settings nothing reads

Intent: [intent.md](intent.md)

## Requirements

1. `metaRules` returns no Alert rule when `rules.alertAboveBreakeven` is false.
2. `show_campaign_widget` lists no Alert rule in that case.
3. `campaign_plan` omits `urlTags` when `rules.tagUtmContent` is false; the playbook says to add no tags then.
4. `metaSettings`, its patch entry, the Meta settings section and its icon are removed. Meta's Graph version stays the `GRAPH` constant.
5. `WOVAIN_MOCK` leaves `env.ts`, the `mock` script and the docs.
6. A saved settings document with a `meta` group still parses (zod strips unknown keys).
7. `docs/spec.md` Settings, Rehearsal, tooling and open-issue rows match.

## Design

- `rules.ts`: `metaRules` builds the Alert rule only when `rules.alertAboveBreakeven`; export `activeRuleLabels(rules)` (ruleLabels minus Alert when off), used by `campaign.ts` for the widget list.
- `campaign.ts`: `urlTags` is spread into the plan only when enabled.
- `settings.ts`: delete `metaSettings`; `settingsSchema` keeps its other groups, and zod strips the old `meta` key on read, so old records parse.
- Reuse existing helpers; no new dependency.

## Areas of concern

- Old stored settings: covered by zod stripping; a test proves it.
- A campaign already holding an Alert rule in Meta is not deleted when the toggle goes off; `create_rules` only creates. Out of scope.
