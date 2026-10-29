# Tasks

## 1. Core (#152)

- [x] 1.1 Qloo `audiencesOf`, `placesOf`, `fashionBrandsOf`; per-call timeout (60 s for places)
- [x] 1.2 `whoBuys`: demographics, targetable audiences, places by affinity x popularity, fashion brands; throws without Qloo
- [x] 1.3 Decision trace with every value's Qloo source
- [x] 1.4 `who-buys` flag (development and next on, production off)

## 2. Data and API

- [x] 2.1 `idea.who_buys` (jsonb), migration via `pnpm run db:generate`
- [x] 2.2 `ideas.whoBuys`: flag, kill switch, kept per country

## 3. Web

- [x] 3.1 "Who buys this" on each idea card: age and gender, audiences, cities with affinity bars, brands; loading and retry
- [x] 3.2 en, es and fr copy

## 4. Tests

- [x] 4.1 Core: values, different ideas differ, tag-only, country, each Qloo failure, no signal, trace, families, markets
- [x] 4.2 API: the idea's signals
