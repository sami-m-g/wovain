# Verify: Share the widget shell and action handling

## Tests added

- `AddFails` (ad), `LaunchFails` (campaign) and `SkipFails` (design) stories: the action rejects, an alert reading "That didn’t go through" shows, and the buttons are usable again.
- `settings-widget-view.stories.tsx`: the budget summary now reads "$20.00 per product per day" (shared `money`).

## Checks run

All pass: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes` (0 clones), `test` (53), `test:integration` (37), `build`, `test:stories` (32).

## Review findings

The `pr-review-toolkit` agents are not installed here, so general-purpose agents ran the same briefs, plus the `/simplify` angles (reuse, simplification, efficiency, altitude).

- Fixed: `WidgetState<T>` exported instead of `ReturnType<typeof useWidget<T>>`; `useAction` returns `pending`, used by campaign and pricing; design's pricing load moved into a `DesignReady` child, removing the doubled `app` name; pricing validation reads once; a toolresult that fails its schema now shows the connect error instead of loading forever; the orphaned comment in `apps/server/src/widgets.ts` moved.
- Skipped, outside this issue: `void` calls to `requestDisplayMode`, `openLink`, `play()` and the design poll can still reject unhandled; the settings view keeps its own save-status flow, which already shows an error; `useAction` does not log the cause (the banner text is fixed on purpose).

## Try it

Run `pnpm storybook`. Open Widgets/Ad > AddFails, Widgets/Campaign > LaunchFails, Widgets/Design > SkipFails and click the button: the red message appears under the actions. Check Widgets/Design > Reprices and Widgets/Settings > Saves, InvalidValue. Toggle light and dark in the toolbar.

## Departures from the plan

- `useAction` returns `{ busy, failed, pending, run }`, not `error`, because the banner needs a flag, not the exception.
- The change adds 204 lines and removes 155 (stories alone add 58), so "removes more than it adds" is not met. Source files without stories net 9 fewer lines.
