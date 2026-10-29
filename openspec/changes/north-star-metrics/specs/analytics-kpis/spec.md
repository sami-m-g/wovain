## ADDED Requirements

### Requirement: North star milestone events

The system SHALL capture each north star step once per merchant on the server (`signed_up`, `connection_completed`, the setup steps, `first_drop_started`, `design_approved`, `products_published`, `campaign_started`, `campaign_delivering`, `first_sale`, `first_profitable_product`), with `reached_at` and `seconds_since_signup`. `first_profitable_product` SHALL fire when Fourthwall profit minus Meta spend is above zero.

#### Scenario: Second sight of a step

- **WHEN** Insights sees a step the merchant already reached
- **THEN** no second event is captured

#### Scenario: Campaign no longer paused

- **WHEN** a campaign wovain staged reports a Meta status other than PAUSED, ARCHIVED or DELETED
- **THEN** `campaign_started` is captured

### Requirement: Time KPIs

The system SHALL define time to first live campaign (`signed_up` to `campaign_started`, target 10 minutes) and time to first profit (`campaign_delivering` to `first_profitable_product`, target 60 minutes), show both with Meta's review wait (`campaign_started` to `campaign_delivering`) on the Insights page, and chart them with a funnel of the steps on a "North star" PostHog dashboard.

#### Scenario: Profit before delivery data

- **WHEN** a merchant has no `campaign_delivering`
- **THEN** their time to first profit is unknown and the page shows a dash
