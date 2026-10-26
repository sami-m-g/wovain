# Spec Delta

## MODIFIED Requirements

### Requirement: Website sign-in

The system SHALL let a designer create an account and sign in with Google or with email and password through Better Auth mounted at `/api/auth`, and SHALL store sessions in PostgreSQL. A password account SHALL sign in only once its email is verified: the verification link SHALL point at the public origin (`BETTER_AUTH_URL`), and opening it SHALL verify the email and start a session.

#### Scenario: Google sign-in

- **WHEN** a visitor chooses Google on the sign-in page and completes Google's consent
- **THEN** Better Auth creates or links the user, starts a session and redirects to the dashboard

#### Scenario: Email sign-up

- **WHEN** a visitor signs up with email and password
- **THEN** no session starts, a verification email is sent, and the page says to check their email, with options to resend it or sign up with a different email

#### Scenario: Verification link

- **WHEN** a designer opens the link in the verification email
- **THEN** their email is verified, a session starts and they land on the dashboard

#### Scenario: Sign-in before verifying

- **WHEN** a designer signs in with the password of an account whose email isn't verified
- **THEN** the sign-in is refused, a new verification email is sent, and the page says to check their email, with an option to resend it

#### Scenario: Password reset

- **WHEN** a designer requests a password reset for their email
- **THEN** a reset email is sent and the reset page lets them set a new password
