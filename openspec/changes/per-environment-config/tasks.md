# Tasks

Issue #31.

## 1. Settings

- [x] 1.1 `BILLING_CATALOG` schema and loader; billing, api and the Polar seed read it
- [x] 1.2 `PRICING_RULES` schema and loader; core, api and the web app read it
- [x] 1.3 Provider MCP URLs, widget CSP hosts, default blank, Nemotron price and guardrail thresholds through `createCore` and `createMcpServer`
- [x] 1.4 `MCP_URL`, `DOCS_URL`, `EMAIL_FROM` and `SUPPORT_EMAIL` required, with no default or fallback

## 2. Web app

- [x] 2.1 `CatalogProvider` hands the public catalog to client components
- [x] 2.2 Landing examples get their price from the server
- [x] 2.3 ChatGPT setup copy renders `MCP_URL`

## 3. Deploy

- [x] 3.1 Pulumi config keys, Cloud Run envs (production and dev) and `WEB_BUILD_ENV`
- [x] 3.2 `infra/Pulumi.prod.yaml` holds today's values
- [x] 3.3 The deploy workflow fails on a missing variable; CI sets its own values

## 4. Tests

- [x] 4.1 Catalog tests: missing, incomplete and code-carrying catalogs are refused
- [x] 4.2 Test fixtures for the catalog and pricing rules
