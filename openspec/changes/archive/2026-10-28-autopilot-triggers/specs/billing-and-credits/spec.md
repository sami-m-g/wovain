## MODIFIED Requirements

### Requirement: Autopilot entitlement

Autopilot SHALL be available on plans whose catalog entry has `autopilot`, and to any merchant for whom the `autopilot` flag is on (every plan in dev and next). Each plan SHALL have a daily autopilot credit cap, `autopilotDailyCredits`.

#### Scenario: Free user starts autopilot

- **WHEN** a Free user starts a run with `autopilot: true` and the `autopilot` flag is off for them
- **THEN** the run is refused with the upgrade link

#### Scenario: Free user starts autopilot with the flag

- **WHEN** a Free user starts a run with `autopilot: true` and the `autopilot` flag is on for them
- **THEN** the run starts
