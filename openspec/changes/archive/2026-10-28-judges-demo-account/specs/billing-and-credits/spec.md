# Spec Delta

## ADDED Requirements

### Requirement: Promos for named accounts

A promo MAY name the only accounts that may redeem it, by email (`emails` in `BILLING_CATALOG`, compared without case). The redeem endpoint SHALL answer any other account as it answers an unknown code, without the promo's id, and Polar's webhook SHALL NOT credit any other account with it.

#### Scenario: The named account redeems

- **WHEN** the account a promo names redeems its code
- **THEN** the checkout is confirmed and the credits arrive by webhook, like any promo

#### Scenario: Another account tries the code

- **WHEN** an account the promo doesn't name enters its code
- **THEN** the request is refused with `PROMO_INVALID` and no checkout opens

#### Scenario: A grant reaches another account

- **WHEN** Polar grants the promo's credits to an account it doesn't name
- **THEN** no credits are added and no `promo_redeemed` event is sent
