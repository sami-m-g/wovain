# auth Specification

## Purpose

Sign-in for designers on the website and in ChatGPT, built on Better Auth: Google and email accounts, sessions, and the OAuth server that ChatGPT uses to call the MCP server.

## Requirements

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

### Requirement: ChatGPT OAuth server

The system SHALL act as an OAuth 2.1 authorization server for the MCP endpoint, publish discovery at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, and verify the access token on every `/api/mcp` request.

#### Scenario: ChatGPT connects

- **WHEN** a designer adds `https://mcp.wovain.com/api/mcp` as a connector in ChatGPT
- **THEN** they sign in, approve access on the consent page, and ChatGPT receives a token bound to the MCP resource

#### Scenario: Missing or invalid token

- **WHEN** a request to `/api/mcp` has no valid access token
- **THEN** the server answers 401 and points to the protected-resource metadata

### Requirement: Owner-scoped access

Every seller API procedure SHALL require a session or an MCP access token, and SHALL return only rows owned by the signed-in user.

#### Scenario: Another user's row

- **WHEN** a signed-in designer asks for a run, design, product or campaign owned by someone else
- **THEN** the API answers as if the row does not exist

### Requirement: Sign-up analytics

The system SHALL send a `sign_up` event to PostHog when a user is created, with the user id as the distinct id.

#### Scenario: New account

- **WHEN** a user record is created
- **THEN** one `sign_up` event is captured
