# billing-and-credits Specification

## Purpose

Limits on what wovain spends on its own providers for each user. Today these are spend limits in configuration; plans and credits through Polar are proposed in the `add-polar-billing` change.

## Requirements

### Requirement: Metered paid steps

The system SHALL record the estimated cost of each paid step (research, design, assist) in `usage` with the run and user.

#### Scenario: Research step

- **WHEN** a research step runs
- **THEN** a usage row with its kind and cost is recorded

### Requirement: Promo codes for credits

The system SHALL define promo codes in code (`packages/billing/src/promos.ts`) and apply them to Polar with `pnpm polar:seed`. Each promo SHALL be a one-time credit pack product with a 100%-off discount restricted to it, limited by Polar's total and per-customer redemptions and by its end date. Code values SHALL NOT be stored in the repository: the seed SHALL generate a random code and store it only in Polar and Secret Manager, never printing it.

#### Scenario: Seed runs again

- **WHEN** `pnpm polar:seed` runs and a promo's discount already exists
- **THEN** its terms are updated if they changed, and its code is kept

#### Scenario: Promo turned off

- **WHEN** a promo is marked off and the seed runs
- **THEN** its product is archived, its discount is deleted, and the app refuses its code

### Requirement: Redeeming a code

A merchant SHALL redeem a code on the Billing page. The server SHALL open a Polar checkout with the code's discount applied and confirm it itself when it is $0. Credits SHALL arrive only through Polar's webhook, as a pack grant whose ledger entry notes the promo, and the system SHALL record a `promo_redeemed` event with the promo id, the credits and the surface.

#### Scenario: Free code while paid plans are off

- **WHEN** a merchant redeems a 100%-off code and `billing-paid-plans` is off
- **THEN** the checkout is confirmed without a payment form and the promo's credits arrive by webhook

#### Scenario: Code that isn't free while paid plans are off

- **WHEN** a code's checkout would charge the merchant and `billing-paid-plans` is off
- **THEN** the request is refused with `PROMO_NOT_FREE` and nothing is charged

#### Scenario: Unknown or expired code

- **WHEN** a merchant enters a code that matches no promo, or one past its end date
- **THEN** the request is refused with `PROMO_INVALID` or `PROMO_EXPIRED`

### Requirement: Promo abuse limits

Each merchant SHALL redeem a promo at most once, enforced when the checkout opens and again when credits are granted. The redeem endpoint SHALL allow at most 5 attempts per merchant per 10 minutes, across every server instance.

#### Scenario: Second redemption

- **WHEN** a merchant who already holds a promo's credits redeems its code again
- **THEN** the request is refused with `PROMO_ALREADY_REDEEMED`

#### Scenario: Two checkouts finish at once

- **WHEN** Polar grants a promo twice to one merchant
- **THEN** only the first grant brings credits

#### Scenario: Guessing codes

- **WHEN** a merchant makes a sixth attempt within 10 minutes
- **THEN** the request is refused with `TOO_MANY_REQUESTS`

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

Autopilot SHALL be available on plans whose catalog entry has `autopilot`, and to any merchant for whom the `autopilot` flag is on (every plan in dev and next). Each plan SHALL have a daily autopilot credit cap, `autopilotDailyCredits`.

#### Scenario: Free user starts autopilot

- **WHEN** a Free user starts a run with `autopilot: true` and the `autopilot` flag is off for them
- **THEN** the run is refused with the upgrade link

#### Scenario: Free user starts autopilot with the flag

- **WHEN** a Free user starts a run with `autopilot: true` and the `autopilot` flag is on for them
- **THEN** the run starts
