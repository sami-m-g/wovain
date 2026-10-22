# Intent: Remove or wire the settings nothing reads

Issue: #10

## Problem

The merchant can edit four settings that no code reads, and `WOVAIN_MOCK` is parsed but only a test reads it.

- `alertAboveBreakeven`: `metaRules` always creates the Alert rule, so turning it off does nothing. This is a bug.
- `tagUtmContent`: `campaign_plan` always sends the UTM tags.
- `graphApiVersion`: `meta-graph.ts` hardcodes `v26.0`.
- `aiDisclosure`: the campaign playbook asks the merchant every time instead.

Reproduction for the bug: Settings > Rules, turn off "Alert when cost per sale passes breakeven", then run `create_rules`. The Alert rule is still created in Meta.

## Desired outcome

- Turning off `alertAboveBreakeven` creates no Alert rule and shows none in the campaign widget.
- Turning off `tagUtmContent` makes `campaign_plan` return no URL tags.
- `graphApiVersion`, `aiDisclosure` and the Meta settings section are gone; `WOVAIN_MOCK` and `pnpm mock` are gone.
- `docs/spec.md` matches the code.

## Constraints

- Firestore records are parsed on read with no migrations, so saved settings that still hold the removed fields must parse.
- No new settings or settings UI.
- The change removes more lines than it adds, apart from the bug fix.

## Open questions

None. Choice for the two dead Meta settings: delete. The playbook already asks about AI labels per campaign, and the API version is a pinned code constant tied to the tested payloads.
