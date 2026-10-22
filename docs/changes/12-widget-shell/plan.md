# Plan: Share the widget shell and action handling

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/widgets.ts`, `packages/shared/package.json`: new `widgetNames` export.
- `apps/widgets/build.ts`, `apps/server/src/widgets.ts`: import it.
- `apps/widgets/src/lib/bridge.ts`: `useWidget` state union.
- `apps/widgets/src/lib/widget-shell.tsx`, `use-action.ts`: new.
- `apps/widgets/src/{ad,campaign,settings,design}/*-widget.tsx`: use `WidgetShell`.
- `apps/widgets/src/{ad,campaign,design}/*-view.tsx`: use `useAction`, render `ActionError`.
- `apps/widgets/src/design/pricing-settings.tsx`: shared schema and `z.infer`.
- `apps/widgets/src/settings/fields.ts`: shared `money`.
- Stories: a failing-action story per view.
- `docs/spec.md` if it states the changed facts.

## Order of work

1. Shared `widgetNames`, wire both consumers.
2. `useWidget` state, `WidgetShell`, migrate the four widgets.
3. `useAction` and `ActionError`, migrate the three views.
4. Pricing schema and `money`.
5. Stories, docs, checks.

## Risks

- Hook order in `DesignWidget` (its `useEffect` ran before the early returns); keep hooks above the shell.
- Story play tests rely on button states; `useAction` must keep `busy` semantics.

## Tests that prove it

- `pnpm test:stories` (light and dark); new failure stories assert the alert.
- `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `build`.
