# Spec Delta

## ADDED Requirements

### Requirement: Dashboards and alerts from code

PostHog dashboards, insights and alerts SHALL be defined in `infra/posthog` and applied from code; objects made by hand SHALL be imported or removed.

#### Scenario: Plan after merge

- **WHEN** `posthog:plan` runs on main
- **THEN** it shows no drift between code and PostHog after apply

### Requirement: Run outcome events

The system SHALL capture `run_completed` and `run_failed` with `run_id`, `duration_ms` and, on failure, `failed_step` and `error_type`, and SHALL capture `design_generated` and `design_rejected` so the approval rate is exact.

#### Scenario: Run fails

- **WHEN** a run fails at the design step
- **THEN** a `run_failed` event with `failed_step: design` is captured

### Requirement: Activation and quality alerts

The KPIs `activation-cohort`, `run-success-rate` and `design-approval-rate` SHALL have `kpi:<id>` alerts that only fire once the sample is large enough.

#### Scenario: Small sample

- **WHEN** fewer runs than the guard threshold happened in the window
- **THEN** the run success alert does not fire
