# mobile-app Specification

## Purpose

The wovain mobile app (Expo): sign-in with the website's accounts, the suggestions inbox, the approvals queue, drops and designs review, KPIs, and push notifications to the merchant's phones.

## Requirements

### Requirement: Mobile sign-in

The mobile app SHALL sign merchants in with the same Better Auth accounts as the website, through Better Auth's Expo client. The session SHALL be stored in the device's secure storage. The server SHALL trust the `wovain://` scheme, and SHALL trust `exp://` only in development.

#### Scenario: Signed-in merchant reopens the app

- **WHEN** a merchant who signed in earlier opens the app
- **THEN** the app shows their inbox without asking them to sign in again

#### Scenario: Signed-out merchant

- **WHEN** a merchant without a session opens the app
- **THEN** the app shows the sign-in screen

### Requirement: Mobile screens

Behind the `mobile-app` flag, the app SHALL show four tabs for the signed-in merchant: the suggestions inbox, the approvals queue, review (runs waiting at the ideas gate and designs waiting for approval), and KPIs from `insights.overview`. Every decision SHALL go through the same oRPC procedures as the website. Each tab SHALL have a mic button slot for hold-to-talk, which stays disabled until voice input ships.

#### Scenario: Approve from the queue

- **WHEN** a merchant approves a pending approval in the app
- **THEN** the app calls `approvals.decide` with `approve: true` and the item leaves the pending list

#### Scenario: Reject a design

- **WHEN** a merchant rejects a design waiting for approval
- **THEN** the app calls `designs.reject` and the design shows as rejected

#### Scenario: Flag off

- **WHEN** `mobile-app` is off for the merchant
- **THEN** `inbox.list` and `devices.register` answer NOT_FOUND and the app says the feature isn't available yet

### Requirement: Device registration

The app SHALL register the device's Expo push token with `devices.register` after the merchant grants notification permission. A token SHALL belong to one merchant: registering a token that another merchant holds SHALL move it to the new one. Signing out SHALL unregister the token.

#### Scenario: Token moves between accounts

- **WHEN** merchant B signs in on a phone that merchant A used and the app registers the same token
- **THEN** the token belongs to B and A gets no more pushes on that phone

### Requirement: Push for approvals and suggestions

An `approval.requested` event SHALL become a notify event of kind `approval` with the approval's title. A `trigger.fired` event that carries a `suggestionId` SHALL become a notify event of kind `suggestion` with the suggestion's title and rationale.

#### Scenario: Approval waits

- **WHEN** an agent enqueues an action that needs the merchant's approval
- **THEN** the merchant's phones get a push with the approval's title, and tapping it opens the approvals tab

### Requirement: Push delivery

A `wovain/notify` event SHALL be sent to every device of the merchant through the Expo Push Service, but only when `mobile-app` is on for that merchant. A token that Expo reports as not registered SHALL be deleted. Delivery failures SHALL be logged at error level.

#### Scenario: Stale token

- **WHEN** Expo answers `DeviceNotRegistered` for a token
- **THEN** that token's device row is deleted

#### Scenario: Flag off

- **WHEN** a notify event arrives for a merchant with `mobile-app` off
- **THEN** no push is sent
