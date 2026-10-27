# analytics-kpis Specification

## Purpose

Product analytics in PostHog around one North Star: activated merchants per week, where a merchant is activated when they approve a design within 7 days of sign-up.

## Requirements

### Requirement: Funnel events

The system SHALL capture `sign_up`, `connect_provider`, `run_started`, `design_approved`, `product_published` and `campaign_created` on the server with the user id as distinct id, plus `via` (`web` or `chatgpt`) and `environment`.

#### Scenario: Approval from ChatGPT

- **WHEN** a design is approved through the MCP tool
- **THEN** a `design_approved` event with `via: chatgpt` is captured

### Requirement: Web and error analytics

The website SHALL capture pageviews, autocapture, web vitals and `landing_cta_clicked`, and server and browser errors SHALL be reported as `$exception`.

#### Scenario: Server error

- **WHEN** an oRPC procedure throws an unexpected error
- **THEN** a `$exception` event with the procedure name is captured

### Requirement: North Star and KPIs

The North Star SHALL be activated merchants per week, shown on PostHog dashboards.

#### Scenario: Merchant activates

- **WHEN** a merchant approves a design within 7 days of sign-up
- **THEN** they count as activated that week
