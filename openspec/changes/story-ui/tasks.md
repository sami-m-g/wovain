# Tasks

Issues #199, #200 and #201.

## 1. Rail and Home (#199)

- [x] 1.1 `story-ui` and `scan-now` flags; `autopilot-triggers` and `voice-input` development-only; `flags.json` regenerated
- [x] 1.2 The 4-item rail (Home, Drops, Store, Settings) and a breadcrumb that roots at Home
- [x] 1.3 Home: next action, what sells now, drops in progress, results with an empty first-sale state
- [x] 1.4 One setup source of truth (`use-launch-facts`) for the Home and the onboarding steps; brand stays optional
- [x] 1.5 Settings hub: connections, brand (optional), billing, account
- [x] 1.6 Scan now behind `scan-now`
- [x] 1.7 With and Without Qloo panel removed from the merchant UI
- [x] 1.8 Messages in en, es and fr; docs; tests; Playwright check at 1470 and 390 px

## 2. Drop page (#200)

- [ ] 2.1 One page per drop, read top to bottom, with each section's state
- [ ] 2.2 Decided by Qloo marker with its evidence at the audience and the targeting
- [ ] 2.3 The autopilot switch leaves the drop header
- [ ] 2.4 Messages, docs, tests; Playwright check at 1470 and 390 px

## 3. Idea card (#201)

- [ ] 3.1 Fixed sections in a fixed order, each with a "Not available: <reason>" state
- [ ] 3.2 Title and concept from the ranking pipeline
- [ ] 3.3 Decided by Qloo marker on each suggestion and idea
- [ ] 3.4 Messages, docs, tests; Playwright check at 1470 and 390 px; archive the change
