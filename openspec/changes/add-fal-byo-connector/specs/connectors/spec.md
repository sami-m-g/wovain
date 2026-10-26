# Spec Delta

## ADDED Requirements

### Requirement: Merchant fal key

The system SHALL let a designer connect fal with their own API key, SHALL seal it like OAuth tokens, and SHALL draw that designer's artwork with their key.

#### Scenario: Key saved

- **WHEN** a designer enters a valid fal key on the connections page
- **THEN** a sealed `fal` connection is stored and later designs are drawn on their fal account

#### Scenario: No fal connection

- **WHEN** a design step runs for a designer without a fal connection
- **THEN** the step fails with what is missing and the connect link
