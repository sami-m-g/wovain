# Spec Delta

## ADDED Requirements

### Requirement: Plans

The system SHALL sell plans through Polar as merchant of record, defined in one file (`packages/billing/src/plans.ts`) and applied with `pnpm polar:seed`. Every new user SHALL get the Free plan.

#### Scenario: New account

- **WHEN** a user signs up
- **THEN** they are on the Free plan with its monthly credits

### Requirement: Free-only launch

Paid plans and credit packs SHALL stay off sale while the `billing-paid-plans` flag is off (the default): checkout SHALL refuse with `PAID_PLANS_NOT_AVAILABLE`, the paid Polar products SHALL stay archived, and the pricing page SHALL show them as coming soon.

#### Scenario: Checkout while paid plans are off

- **WHEN** a merchant asks for a Studio, Label or credit pack checkout and `billing-paid-plans` is off
- **THEN** the request is refused with `PAID_PLANS_NOT_AVAILABLE` and no Polar checkout is created

#### Scenario: Existing merchant's first paid step

- **WHEN** a merchant from before billing, with no plan yet, starts a paid step
- **THEN** wovain puts them on Free in Polar and the step runs once the free credits arrive

### Requirement: Webhook secret from code

`pnpm polar:seed` SHALL create or keep the Polar webhook endpoint and write its signing secret straight to Secret Manager (`polar-webhook-secret`), never printing it; it SHALL rotate the secret only when the store has none.

#### Scenario: Endpoint exists and its secret is stored

- **WHEN** the seed runs again
- **THEN** the endpoint and its secret are kept

### Requirement: Credit reservation

A paid step SHALL reserve its credits atomically before it runs, settle them when it succeeds and release them when it fails; a step with too few credits SHALL be refused before any provider is called.

#### Scenario: Concurrent steps

- **WHEN** two paid steps reserve at the same time and only one fits the balance
- **THEN** exactly one reservation succeeds and the other is refused

#### Scenario: Step fails

- **WHEN** a paid step fails after reserving
- **THEN** its credits are released back to the balance

### Requirement: Polar sync

Subscription and order state SHALL come only from Polar webhooks, and each webhook event SHALL be applied at most once.

#### Scenario: Webhook redelivered

- **WHEN** Polar delivers the same event twice
- **THEN** the ledger changes only once

### Requirement: Autopilot entitlement

Autopilot SHALL be available only on paid plans.

#### Scenario: Free user starts autopilot

- **WHEN** a Free user starts a run with `autopilot: true`
- **THEN** the run is refused with the upgrade link

## REMOVED Requirements

### Requirement: Spend limits

**Reason**: Plans, credits and reservations replace the email allowlist and global `SPEND_*` limits.

**Migration**: Remove `WOVAIN_ALLOWED_EMAILS` and `SPEND_*`; every user starts on Free and paid steps are charged in credits.
