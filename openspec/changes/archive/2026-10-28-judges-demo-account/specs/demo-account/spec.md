# Spec Delta

## ADDED Requirements

### Requirement: Judges' demo account

The system SHALL provide one shared account for hackathon judges on next.wovain.com, `judges@wovain.com`, created by `pnpm --filter @wovain/auth seed:judges` through Better Auth's server API with its email verified and a random password. The password SHALL be printed once to stdout and stored nowhere else, never in the repository.

#### Scenario: First run

- **WHEN** the seed runs and the account doesn't exist
- **THEN** it creates the verified account and prints its password once

#### Scenario: Second run

- **WHEN** the seed runs again
- **THEN** it changes nothing, keeps the password and doesn't print one

#### Scenario: Password reset

- **WHEN** the seed runs with `--reset-password`
- **THEN** it sets and prints a new password and signs out every session of the account

### Requirement: Demo account setup

The seed SHALL add a sample brand profile marked onboarded, keeping the judges' later edits, and SHALL set the `draft` autonomy level with a low spend cap, audited like a change from Settings. The account's credits SHALL come only from a promo that names it, granted through Polar's webhook.

#### Scenario: Landing

- **WHEN** a judge signs in
- **THEN** they land on the overview, whose checklist is titled "Start here", with the brand step done

#### Scenario: Autonomy drifted

- **WHEN** the account's autonomy setting differs from the seed's and the seed runs
- **THEN** it is set back to `draft` with the low spend cap and the change is audited

### Requirement: Seed guard before connecting

The seed SHALL refuse to run unless `--env next` or `--env dev` is given. It SHALL refuse a `DATABASE_URL` that reaches production's Cloud SQL instance, signs in as production's database user, or comes from production's secret, as infra declares them. With `--env next` it SHALL require next's database; with `--env dev`, a local database.

#### Scenario: No environment

- **WHEN** the seed runs without `--env`, or with any value but `next` or `dev`
- **THEN** it exits non-zero without connecting

#### Scenario: Production's database

- **WHEN** `DATABASE_URL` names production's instance, user or secret
- **THEN** it exits non-zero without connecting, whatever `--env` says

### Requirement: Seed guard once connected

Once connected, the seed SHALL ask the server which database it is and whether it is Cloud SQL, and SHALL refuse production's database on Cloud SQL, any database but next's for `--env next`, and any Cloud SQL server for `--env dev`, before writing anything.

#### Scenario: The server disagrees

- **WHEN** the URL passes but the server's database isn't next's for `--env next`
- **THEN** it exits non-zero before writing anything
