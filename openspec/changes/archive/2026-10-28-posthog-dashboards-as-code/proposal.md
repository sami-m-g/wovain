# Proposal

Status: in review.

## Why

The four product dashboards and three alerts around the North Star (activated merchants per week) were created through the PostHog API, so they can drift from code.

## What Changes

- `infra/posthog/dashboards.ts`: Growth, Retention, Agent quality and cost, and Web vitals dashboards with their 29 insights.
- Three KPI alerts: `activation-cohort`, `run-success-rate`, `design-approval-rate`, each named `kpi:<id>`.
- A one-time `pulumi import --file infra/posthog/import.json` adopts the API-created objects; the next `pulumi up` renames the alerts to `kpi:<id>`.
- Planned with `migrate-runs-to-mastra` and `add-polar-billing`: the missing events (`run_completed`, `run_failed`, `design_generated`, `design_rejected`, `agent_score`, `campaign_activated`, subscription and credit events).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `analytics-kpis`: dashboards and alerts come from code; adds the activation, run success and approval KPIs.

## Impact

`infra/posthog/` (Pulumi, in the `prod` stack). After merge: a person runs the one-time import, then `pnpm infra:preview` and `pnpm infra:up`; `import.json` is deleted in a follow-up.
