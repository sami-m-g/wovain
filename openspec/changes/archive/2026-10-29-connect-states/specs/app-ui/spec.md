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

#### Scenario: Merchant with no Fourthwall shop

- **WHEN** a Fourthwall connect prompt shows (onboarding, a connect state or the Connections page)
- **THEN** it keeps "Connect Fourthwall" as the primary button and adds one line, "No Fourthwall shop yet?", with a secondary link "Create a free Fourthwall shop" to Fourthwall's sign-up in a new tab (`rel="noopener noreferrer"`) and the hint "Then come back and connect it."
- **AND** clicking the link captures `fourthwall_signup_clicked` with the surface (`onboarding`, `connect_state` or `connections`)
