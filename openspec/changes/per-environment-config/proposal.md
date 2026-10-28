# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/31

## Why

Values that change per environment, or that the business changes without a code change (prices, plans, promos, provider URLs, model prices, guardrail thresholds), were constants in code or had silent fallbacks (`?? "https://..."`, schema defaults, `${SITE_URL:-https://wovain.com}` in the deploy workflow). A missing value then picked production's silently, and changing a price meant a release.

## What Changes

- Every such value is an env var in `apps/web/.env.schema` with no default, set per environment from Pulumi stack config (`infra/index.ts`, `infra/Pulumi.<stack>.yaml`) on Cloud Run and in the image build (the `WEB_BUILD_ENV` Actions variable).
- `BILLING_CATALOG` (JSON, validated with zod in `packages/billing/src/catalog.ts`): plans, the credit pack, credit costs, promos, the promo price per credit, the redemption limit and the runs a merchant has going at once.
- `PRICING_RULES` (JSON, validated with zod in `packages/core/src/pricing.ts`), `FOURTHWALL_DEFAULT_PRODUCT_ID`, `FAL_MCP_URL`, `FOURTHWALL_MCP_URL`, `META_MCP_URL`, `MCP_WIDGET_RESOURCE_DOMAINS`, `NEMOTRON_INPUT_PRICE`, `NEMOTRON_OUTPUT_PRICE` and `GUARDRAIL_{INJECTION,MODERATION,PII}_THRESHOLD`.
- `MCP_URL`, `DOCS_URL`, `EMAIL_FROM` and the new `SUPPORT_EMAIL` are required, with no default or fallback; the ChatGPT setup copy renders `MCP_URL`.
- The deploy workflow fails when `SITE_URL`, `DOCS_SITE_URL` or `WEB_BUILD_ENV` is missing.
- Client components get the plans, the pack and the credit costs from the locale layout (`CatalogProvider`), never from the environment; promos stay on the server.
- `infra/Pulumi.prod.yaml` holds today's values, so production behaves the same.

## Capabilities

### New Capabilities

- `runtime-config`: per-environment settings come from the environment, are validated, and never fall back to a default.

## Impact

- `packages/billing` (catalog, plans, promos, redeem, seed), `packages/core` (pricing, fourthwall, upstream, agents, core), `packages/api` (mcp, workflows/run, flow, mastra entry), `packages/auth` (`MCP_URL` required)
- `apps/web`: `.env.schema`, billing components, landing examples, footer, content
- `infra/index.ts`, `infra/Pulumi.prod.yaml`, `.github/workflows/{ci,deploy}.yml`, `turbo.json`
- Local work needs these values in `apps/web/.env.local` (production's are in `infra/Pulumi.prod.yaml`).
