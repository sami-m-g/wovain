# Tasks

Issue #68.

## 1. Core

- [x] 1.1 `autopilot-signals.ts`: Qloo rising brands (`bias.trends`), Tavily week news, match and rationale, with tests
- [x] 1.2 `wovain/autopilot.scan` event

## 2. Billing

- [x] 2.1 `autopilotDailyCredits` per plan in the catalog, fixture and Pulumi config; Free autopilot in dev and next
- [x] 2.2 `assertAutopilot` accepts the `autopilot` flag

## 3. API

- [x] 3.1 `flow/autopilot.ts`: scan a brand, save suggestions with traces, act through the queue, execute, credit cap, log
- [x] 3.2 Inngest functions: schedule, scan, act, execute
- [x] 3.3 oRPC `autopilot.status`, `log`, `scan`, `accept`, `dismiss`, gated by `autopilot-triggers`
- [x] 3.4 Tests

## 4. Web

- [x] 4.1 `/dashboard/autopilot` decision log, sidebar link when the flag is on, en/es/fr copy

## 5. Docs

- [x] 5.1 Docs no longer call autopilot live
