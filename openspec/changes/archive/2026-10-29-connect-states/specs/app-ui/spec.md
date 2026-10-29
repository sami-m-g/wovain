# Spec Delta

## ADDED Requirements

### Requirement: Connect states, not errors

When a screen or step can't load or finish because the merchant hasn't connected a provider, or its sign-in expired, the app SHALL show a connect state instead of an error: the provider's mark, one line on what connecting unlocks and a primary connect button that starts the Connections flow and returns to the same screen. A missing connection SHALL NOT raise an error toast or an error-level log; every other failure SHALL stay an error. fal SHALL NOT be named while wovain draws the art.

#### Scenario: Products without Fourthwall

- **WHEN** a designer without a Fourthwall connection opens Products
- **THEN** one connect state for Fourthwall replaces readiness, drops, products and orders, with no error shown

#### Scenario: Run stopped for a missing connection

- **WHEN** a run failed because Fourthwall isn't connected
- **THEN** the run view offers "Connect Fourthwall", returns to the same run after connecting and then offers "Try again" in one click
