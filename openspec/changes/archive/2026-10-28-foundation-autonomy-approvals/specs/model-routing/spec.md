# Spec Delta

## ADDED Requirements

### Requirement: A Nemotron model per job

The app SHALL read one Nebius model ID for each kind of job from the environment: `NEMOTRON_MODEL_FAST`, `NEMOTRON_MODEL_DEFAULT`, `NEMOTRON_MODEL_REASONING`, `NEMOTRON_MODEL_VISION` and `NEMOTRON_MODEL_SAFETY`. Each SHALL be declared in `apps/web/.env.schema` and set per environment from Pulumi stack config. Code SHALL ask for a role, never name a model ID.

#### Scenario: Model change

- **WHEN** the owner sets `nemotronModelReasoning-next` to a new model ID and applies it
- **THEN** next.wovain.com uses that model for reasoning jobs with no code change

#### Scenario: Empty model ID

- **WHEN** one of the five variables is empty
- **THEN** startup fails with an error naming the variable
