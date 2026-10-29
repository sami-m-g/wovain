# Spec Delta

## ADDED Requirements

### Requirement: Guided pixel and payouts steps

The pixel and payouts steps SHALL give plain steps and open the exact Fourthwall page (Tracking pixels; Billing and payouts). The pixel step SHALL show the pixel ID with a copy button. When payouts can't be read as active, the designer SHALL be able to mark them set up by Fourthwall support, as a `store.setup.confirm` action, and the step SHALL then show as done on their word.

#### Scenario: Payouts set up by support

- **WHEN** Fourthwall reports payouts as inactive and the designer chooses Fourthwall support set up my payouts
- **THEN** the payouts step shows as done and says it was marked by the designer

#### Scenario: Pixel steps

- **WHEN** the pixel isn't firing on the shop yet
- **THEN** the step shows the pixel ID to copy, the steps, and a link to Fourthwall's Tracking pixels page
