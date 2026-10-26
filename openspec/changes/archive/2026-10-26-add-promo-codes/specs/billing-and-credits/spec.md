# Spec Delta

## ADDED Requirements

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
