# Spec Delta

## ADDED Requirements

### Requirement: One-click unsubscribe

Every non-essential email (run updates) SHALL carry `List-Unsubscribe` with a mailto and an https link, and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The link SHALL be signed with a server secret, and a POST to it SHALL stop run updates to that address. A GET SHALL change nothing.

#### Scenario: Mail client unsubscribes

- **WHEN** a mail client POSTs `List-Unsubscribe=One-Click` to the link
- **THEN** the address gets no further run updates

#### Scenario: Forged link

- **WHEN** the token's signature does not match its address
- **THEN** the endpoint answers 400 and changes nothing

### Requirement: Essential email is always sent

Verification and password-reset email SHALL carry no unsubscribe header or link and SHALL be sent to opted-out addresses.

#### Scenario: Opted-out address resets its password

- **WHEN** an address that unsubscribed asks for a reset
- **THEN** the reset email is sent

### Requirement: Reply address and plain text

Every email SHALL set `replyTo` to a monitored address, print its link as text beside the button, and send a plain-text twin.

#### Scenario: Reply

- **WHEN** a merchant replies to any email
- **THEN** the reply goes to `EMAIL_REPLY_TO`

### Requirement: Tracking off for transactional mail

The Resend domain SHALL be able to turn open and click tracking off through infrastructure code, per stack, so verify and reset links are never rewritten.

#### Scenario: Stack opts in

- **WHEN** a stack sets `resendTracking: off`
- **THEN** Pulumi sets `open_tracking` and `click_tracking` to false on its Resend domain
