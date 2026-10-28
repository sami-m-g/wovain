# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant fal account

While the `onboarding-wizard` flag is off, the system SHALL let a designer connect fal by signing in with OAuth, SHALL seal the grant like the other provider tokens, and SHALL draw that designer's artwork on their fal account. While the flag is on and `FAL_KEY` is set, the system SHALL draw every design on wovain's own fal key, paid by the design's credits, SHALL NOT ask for a fal connection and SHALL hide the fal card.

#### Scenario: fal connected

- **WHEN** the flag is off and a designer signs in to fal from the connections page
- **THEN** a sealed `fal` connection is stored and later designs are drawn on their fal account

#### Scenario: No fal connection

- **WHEN** the flag is off and a design step runs for a designer without a fal connection
- **THEN** the step fails with what is missing and the connect link

#### Scenario: wovain draws

- **WHEN** the flag is on, `FAL_KEY` is set and a designer with no fal connection starts a run
- **THEN** the run starts, each design is drawn on wovain's key and its design credits are debited
