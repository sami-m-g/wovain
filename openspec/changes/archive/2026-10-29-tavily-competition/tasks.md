# Tasks

## 1. Read (#106)

- [x] 1.1 Search the marketplaces per theme and filter near-identical listings in code; level and cited sample
- [x] 1.2 Extract the top listings with a query and read their prices with `competitorPrices`
- [x] 1.3 Add the `competition_summary` agent (default job) with a Zod schema; drop points citing pages not read
- [x] 1.4 Compute gaps from the theme's Qloo affinity cues
- [x] 1.5 Save the read on `idea.competition` (new column and migration); mark a failed search unknown and log every failure at error level

## 2. Use

- [x] 2.1 The design brief gets the looks to avoid and the gaps to aim at
- [x] 2.2 The ad writer gets the competitor angles and counter-positions; the grounding guard accepts cited lines
- [x] 2.3 Autopilot skips saturated themes and stores why
- [x] 2.4 Record each step in the decision trace

## 3. UI and docs

- [x] 3.1 Competition panel on idea cards (with "check again") and campaign cards (en, es, fr)
- [x] 3.2 Document the read on the Tavily page, including that Meta Ad Library pages can't be read; scope table row

## 4. Ship

- [x] 4.1 Add the `tavily-competition` flag (on in dev and next, off in production)
- [x] 4.2 Tests in `packages/core` and `packages/api`
- [x] 4.3 Open the PR that closes #106; archive this change in it
