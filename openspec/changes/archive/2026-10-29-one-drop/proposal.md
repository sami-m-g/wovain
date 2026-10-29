# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/157

## Why

The app used two words for one thing. "New drop" started a "run", the history was called Runs, and a separate Drops page planned a capsule from a run's idea. That page opened on an empty select, had a dead-end empty state ("Plan one from an idea above"), and its breadcrumb said Overview. Merchants should see one concept: a drop.

## What Changes

- **A drop is one pass through the flow.** The nav, the history page, the copy (en, es, fr) and the docs say "drop", never "run". "Run" stays an internal word: the `run` table, the workflow and the API names don't change.
- **Drops page = every drop.** `/dashboard/drops` lists every drop, newest first (what Runs showed). `/dashboard/runs` redirects to it. The nav's Runs item becomes Drops, always shown.
- **"Make it a capsule" is a step of the drop.** With `design-drops` on, the ideas step shows a capsule panel under the ideas. It makes the first picked idea a capsule of 4 to 6 products, then shows that capsule with its products and its publish button. The standalone capsule page (plan form, drop list, empty state) is removed. `drops.list` returns each capsule's `runId` so the step finds its own.
- **Breadcrumbs.** Overview › Drops for the Drops page, and Overview › Drops › New drop in the flow.
- `docs/scope.md` and `docs/prd.md` and their docs-site copies (en, es, fr) say so.

## Capabilities

### Modified Capabilities

- `design-drops`: capsule planning is a step of the drop, not its own page.

## Impact

- `apps/web`: `capsule.tsx` replaces `drops-board.tsx`; the dashboard `drops` and `runs` pages; sidebar, breadcrumb, nav types and the marketing demo rail; the ideas step; copy.
- `packages/api`: `drops.list` adds `runId`.
- No migration.
