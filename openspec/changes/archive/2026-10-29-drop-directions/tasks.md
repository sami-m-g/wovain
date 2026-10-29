# Tasks

## 1. Core (#129)

- [x] 1.1 `suggestDirections` open mode: one Qloo audience per direction, a new set per round
- [x] 1.2 `suggestDirections` brand mode: rising Qloo entities for the brand's fans, their tags as directions
- [x] 1.3 Tavily momentum and saturation; ranking in code by brand discovery's `scoreOf`
- [x] 1.4 `drop_directions` agent (default job), one Zod-checked call; plain words when it fails
- [x] 1.5 A Qloo failure throws before any Tavily or Nemotron call; every failure at error level
- [x] 1.6 `drop-directions` flag (development and next on, production off)

## 2. API

- [x] 2.1 `runs.directions` (`ignoreBrand`, `round`): flag, `trends-qloo` kill switch, hourly limit, decision trace, `hasBrand`

## 3. Web

- [x] 3.1 What to sell now above the brief: one-click cards, why now, audience, rising entities, news links, similar listings
- [x] 3.2 "Ignore my brand this time" (with a brand), "Show me others" (without), loading, Qloo failure with retry, nothing rising
- [x] 3.3 The brand step reads optional: "Your brand (optional)", "Skip, just help me sell"
- [x] 3.4 en, es and fr copy

## 4. Tests

- [x] 4.1 No brand: one audience per direction; Show me others changes the niches
- [x] 4.2 Different brands get different directions, within their brand
- [x] 4.3 Brand signals, crowded ranks lower, evidence, niche restatement, Qloo failure with and without a brand, words failure, trace
