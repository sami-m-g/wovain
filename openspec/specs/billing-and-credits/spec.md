# billing-and-credits Specification

## Purpose

Limits on what wovain spends on its own providers for each user. Today these are spend limits in configuration; plans and credits through Polar are proposed in the `add-polar-billing` change.

## Requirements

### Requirement: Metered paid steps

The system SHALL record the estimated cost of each paid step (research, design, assist) in `usage` with the run and user.

#### Scenario: Research step

- **WHEN** a research step runs
- **THEN** a usage row with its kind and cost is recorded

### Requirement: Spend limits

The system SHALL refuse a paid step before it runs when the user is not allowed (`WOVAIN_ALLOWED_EMAILS`) or when the daily run limit, images-per-run limit or global daily cap (`SPEND_*`) would be exceeded, with an error that says which limit.

#### Scenario: Daily cap reached

- **WHEN** a paid step would exceed `SPEND_DAILY_CAP_USD`
- **THEN** the step is refused with a spend error and no provider is called
