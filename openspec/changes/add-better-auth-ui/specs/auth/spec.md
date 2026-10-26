# Spec Delta

## ADDED Requirements

### Requirement: Account settings

The system SHALL give a signed-in designer account and security settings to edit their profile, see and revoke sessions, and link or unlink Google, using Better Auth UI components.

#### Scenario: Revoke a session

- **WHEN** a designer revokes another session from security settings
- **THEN** that session is deleted and its next request is signed out

### Requirement: Google available at runtime

The Google sign-in option SHALL be shown whenever `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set at runtime, independent of the values present at build time.

#### Scenario: Image built without Google vars

- **WHEN** the production image was built without the Google variables and runs with them set
- **THEN** the sign-in page shows the Google button
