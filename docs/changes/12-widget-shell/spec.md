# Spec: Share the widget shell and action handling

Intent: [intent.md](intent.md)

## Requirements

- `useWidget` returns a state: `loading`, `error` or `ready`; `ready` carries `app` and `data`.
- `WidgetShell` renders the error and loading text for a widget and its children when ready. All four widgets use it.
- `useAction` runs an async action, tracks which kind is busy, and keeps the last error; `ActionError` shows it as an alert.
- A failed action in the ad, campaign and design views shows an error to the merchant.
- `pricing-settings.tsx` validates with `pricingSettings.pick({ minProfit, minMarginPct }).safeParse` and types values with `z.infer`.
- `fields.ts` imports `money` from `@wovain/shared/economics`.
- `widgetNames` is exported from `packages/shared` and imported by `build.ts` and `apps/server/src/widgets.ts`.

## Design

- `apps/widgets/src/lib/bridge.ts`: `useWidget` gains the state union.
- `apps/widgets/src/lib/widget-shell.tsx` (new): `WidgetShell({ name, loading, widget, children })` with a render-prop child receiving `{ app, data }`, and `ActionError`.
- `apps/widgets/src/lib/use-action.ts` (new): `useAction<K>()` returns `{ busy, error, run(kind, action, onFail?) }`. The design view passes `onFail` to restore its previous design.
- `packages/shared/src/widgets.ts` (new, exported as `./widgets`): `widgetNames` tuple and `WidgetName` type.
- Reuse: `pricingSettings` (`@wovain/shared/settings`), `money` (`@wovain/shared/economics`).
- Checked for existing alternatives: React 19 `useActionState` fits form actions, not button actions with a busy kind, so `useAction` is a thin `useState` hook. No library or MCP tool covers this.

## Areas of concern

- `money` in `fields.ts` printed whole dollars without cents ("$5"); the shared one prints "$5.00". Settings summary text changes slightly; accepted for one definition.
- Errors must not leak internals: the banner shows a fixed sentence, not the exception text.
- The settings view already shows an error on a failed save; it is left as is.
