# Spec Delta

## ADDED Requirements

### Requirement: Per-environment settings come from the environment

Every value that can change without a code change (plans, prices, the credit pack, credit costs, promos, the redemption limit, runs per merchant, pricing rules, the default Fourthwall blank, provider MCP URLs, widget image hosts, model prices, guardrail thresholds, the MCP, docs and support addresses and the email sender) SHALL be read from an env var declared in `apps/web/.env.schema` and set per environment from Pulumi stack config. Code SHALL NOT hold a default or fallback for any of them.

#### Scenario: Price change

- **WHEN** the owner changes a plan's price in `infra/Pulumi.prod.yaml` and applies it
- **THEN** the next revision charges and shows the new price with no code change

#### Scenario: Missing setting

- **WHEN** a deployment or a local run lacks one of these variables
- **THEN** startup, the build or the step that reads it fails with an error naming the variable, and no default is used

### Requirement: JSON settings are validated

`BILLING_CATALOG` and `PRICING_RULES` SHALL be JSON validated with zod before use. A value that is not valid JSON, misses a field, has an unknown field or a value out of range SHALL be refused with an error naming the variable. A promo SHALL NOT carry its code.

#### Scenario: Promo code in the config

- **WHEN** `BILLING_CATALOG` gives a promo a `code`
- **THEN** the catalog is refused, so a code never lands in config or the repository

### Requirement: Deploy fails on a missing variable

The deploy workflow SHALL fail before building when `SITE_URL`, `DOCS_SITE_URL` or `WEB_BUILD_ENV` is not set, instead of using a hardcoded URL.

#### Scenario: Variable not applied

- **WHEN** a deploy runs before Pulumi set `WEB_BUILD_ENV`
- **THEN** the image job fails naming the variable

### Requirement: The browser gets only the public catalog

Client components SHALL receive the plans, the credit pack and the credit costs from the server; the promos SHALL stay on the server.

#### Scenario: Billing page

- **WHEN** a merchant opens the billing page
- **THEN** plan names, prices and pack credits come from the configured catalog, and no promo reaches the browser
