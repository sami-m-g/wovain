# Tasks

## 1. Core (#172)

- [x] 1.1 `suggestDirections` reports steps and each card (facts first, then words)
- [x] 1.2 Qloo client keeps answers for 30 minutes and shares requests in flight
- [x] 1.3 `wovain/directions.refresh` event

## 2. Data and API

- [x] 2.1 `direction_cache`, migration via `pnpm run db:generate`
- [x] 2.2 `runs.directions` streams (oRPC event iterator); kept answers at once; stale ones refreshed
- [x] 2.3 `runs.warmDirections`; the `directions-refresh` Inngest function

## 3. Web

- [x] 3.1 Streamed cards, card-shaped skeletons, step line and elapsed seconds
- [x] 3.2 Warm-up on the overview; en, es and fr copy

## 4. Tests

- [x] 4.1 Core: steps and cards are announced; Qloo answers reused and failures forgotten
- [x] 4.2 API: cache keys
