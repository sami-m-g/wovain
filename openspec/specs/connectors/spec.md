# connectors Specification

## Purpose

How a designer links the services wovain works inside: their own Fourthwall shop and Meta ad account, with credentials sealed at rest. Nebius, Tavily and Qloo run on wovain's own accounts and are not connectors.

## Requirements

### Requirement: Merchant OAuth connections

The system SHALL connect Fourthwall and Meta through each provider's OAuth flow (`/api/connections/[provider]/start` and `callback`), keep pending flows in `connection_flow`, and store one connection per user and provider.

#### Scenario: Connect Fourthwall

- **WHEN** a designer starts the Fourthwall connection and approves it on Fourthwall
- **THEN** a `connection` row is saved for that user and provider and a `connect_provider` event is captured

#### Scenario: Unknown callback state

- **WHEN** the callback state does not match a pending flow
- **THEN** the connection is refused and nothing is stored

### Requirement: Sealed credentials

Provider tokens SHALL be sealed with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`, with the owner and provider bound as additional authenticated data, and SHALL never be returned by the API.

#### Scenario: Token opened for another owner

- **WHEN** a sealed token is opened with a different owner or provider
- **THEN** decryption fails

### Requirement: Platform-paid providers

The system SHALL call Nebius, Tavily and Qloo with wovain's own keys, and a missing key SHALL fail only the step that needs it with `NOT_CONFIGURED` naming the variable.

#### Scenario: Missing Tavily key

- **WHEN** research runs without `TAVILY_API_KEY`
- **THEN** that step fails with `NOT_CONFIGURED` naming `TAVILY_API_KEY` and other procedures keep working

### Requirement: Connection guidance

When a step needs a connection the designer has not made, the API and MCP tools SHALL return what is missing, why, the fix and the connect link.

#### Scenario: No Meta connection

- **WHEN** `create_campaign` is called without a Meta connection
- **THEN** the tool returns an error with the Meta connect link

### Requirement: Merchant fal account

The system SHALL let a designer connect fal by signing in with OAuth, SHALL seal the grant like the other provider tokens, and SHALL draw that designer's artwork on their fal account.

#### Scenario: fal connected

- **WHEN** a designer signs in to fal from the connections page
- **THEN** a sealed `fal` connection is stored and later designs are drawn on their fal account

#### Scenario: No fal connection

- **WHEN** a design step runs for a designer without a fal connection
- **THEN** the step fails with what is missing and the connect link
