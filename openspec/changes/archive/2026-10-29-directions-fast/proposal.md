# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/172

## Why

"What to sell now" showed three blank boxes for 20 to 30 seconds while Qloo, Tavily and Nemotron answered one after another, and nothing showed until all were done.

## What Changes

- **Kept answers.** The suggestions are kept per merchant and request (scope, round, locale and the brand's state) in `direction_cache`. A kept answer is served at once. Past 6 hours it is still served (for up to a week) while Inngest finds a new one (`wovain/directions.refresh`, stale-while-revalidate). Opening the overview asks for that refresh when the default answer is missing or stale (`runs.warmDirections`).
- **Streaming.** `runs.directions` is an oRPC event iterator. It sends the step under way (Qloo, the news and listings checks, the words) and then each card: first with its facts, as soon as its checks finish, then again with Nemotron's words.
- **Qloo answers reused.** The Qloo client keeps each answer for 30 minutes (up to 500 per client) and shares a request already in flight. A failed request is not kept.
- **Progress, not blanks.** Card-shaped skeletons (shadcn Skeleton), a live step line ("Asking Qloo what's rising…") and the elapsed seconds. The brief box stays usable.

## Capabilities

### Modified Capabilities

- `drop-directions`: served from kept answers and streamed.

## Impact

- `packages/core`: `drop-directions.ts` reports progress (`onEvent`) and writes words per card. `qloo.ts` keeps answers. `events.ts` adds `directionsRefresh`.
- `packages/db`: `direction_cache`, migration `direction_cache`.
- `packages/api`: `runs.directions` streams; `runs.warmDirections`; the `directions-refresh` Inngest function.
- `apps/web`: the streamed suggestions, the step line and skeletons, the warm-up on the overview; en, es and fr copy.
