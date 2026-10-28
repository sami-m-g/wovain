# Spec Delta

## ADDED Requirements

### Requirement: Merchant fal account

The system SHALL let a designer connect fal by signing in with OAuth, SHALL seal the grant like the other provider tokens, and SHALL draw that designer's artwork on their fal account.

#### Scenario: fal connected

- **WHEN** a designer signs in to fal from the connections page
- **THEN** a sealed `fal` connection is stored and later designs are drawn on their fal account

#### Scenario: No fal connection

- **WHEN** a design step runs for a designer without a fal connection
- **THEN** the step fails with what is missing and the connect link
