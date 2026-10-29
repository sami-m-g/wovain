## ADDED Requirements

### Requirement: Brand updates follow the autonomy level

The action catalog SHALL include `brand.profile.update` with risk class R2. Under `suggest` and `draft` the policy SHALL answer `needs_approval`. Under `publish_ads_paused` it SHALL answer `allow` only while the `autopilot` flag is on for the merchant, and `needs_approval` otherwise.

#### Scenario: Suggest level

- **WHEN** wovain proposes `brand.profile.update` for a merchant on `suggest`
- **THEN** the policy answers `needs_approval` and the approval shows the evidence

#### Scenario: Autopilot applies it

- **WHEN** wovain proposes `brand.profile.update` for a merchant on `publish_ads_paused` with the `autopilot` flag on and the agent not paused
- **THEN** the policy answers `allow` and the Brand is updated

### Requirement: Brand updates are traced and undoable

A `brand.profile.update` payload SHALL hold the new Brand values and the evidence, and its inverse the previous values. An applied update SHALL be recorded in the decision trace and the audit log, and undoing it SHALL restore the previous values and set the approval to `reverted`. A payload that changes the guardrails, the name, the logo or the price floor SHALL be refused.

#### Scenario: Undo

- **WHEN** the merchant undoes an applied brand update
- **THEN** the Brand has its previous values and the approval is `reverted`

#### Scenario: Guardrail in the payload

- **WHEN** a `brand.profile.update` payload changes the Brand's guardrails
- **THEN** the action is refused and the Brand is unchanged
