# Intent: Share the widget shell and action handling

Issue: #12

## Problem

- The four `*-widget.tsx` files repeat the same connect-error and loading blocks.
- The `run` helpers in the ad, campaign and design views end in `catch {}`, so a failed action leaves the merchant with no sign that anything went wrong.
- `pricing-settings.tsx` re-implements the `pricingSettings` bounds and redeclares the type; `settings/fields.ts` redefines `money`.
- The widget-name list lives twice: `apps/widgets/build.ts` and `apps/server/src/widgets.ts`.

## Desired outcome

- One shell component renders loading and error for every widget.
- One hook runs widget actions and a shared banner shows the merchant when one failed.
- The pricing form validates with the shared schema; `money` and `widgetNames` each have one definition.
- Fewer lines than before, no visual redesign, every story still passes in light and dark.

## Constraints

- Firestore records are parsed on read with no migrations; stored shapes do not change.
- Follow AGENTS.md; update `docs/spec.md` where a fact changes.

## Open questions

None.
