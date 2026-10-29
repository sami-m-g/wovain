# alerts Specification

## Purpose

Telling the merchant, where they are, when wovain acts on their money or needs them: rule actions, scale requests, approvals waiting, a first sale and failures, by email, mobile push and Telegram, once per channel, with per-type channels and quiet hours.

## Requirements

### Requirement: One alerts service on three channels

While the `alerts` flag is on for the merchant, every `wovain/notify` event SHALL be delivered on the channels the merchant picked for its alert type: email through Resend, push through the Expo Push Service to each phone the merchant registered, and Telegram through wovain's bot to the merchant's linked chat. A channel with nothing to reach (no phone, no linked chat, no bot in the environment) SHALL be skipped. With the flag off, nothing SHALL be sent.

#### Scenario: Rule action on every channel

- **WHEN** the profit rules pause an ad for a merchant with a phone and a linked Telegram chat and the default settings
- **THEN** the merchant gets one email, one push and one Telegram message

#### Scenario: Flag off

- **WHEN** a notify event arrives for a merchant with `alerts` off
- **THEN** no email, push or Telegram message is sent

### Requirement: Once per channel, retried, failures logged

Each alert SHALL be sent at most once per merchant, key and channel, where the key is the event's `dedupeKey` or its id. A channel that fails SHALL be retried by Inngest. A channel that fails after its retries SHALL be logged at error level and recorded as failed.

#### Scenario: Two producers, one approval

- **WHEN** the profit rules and `alerts-approval-requested` both send an alert for the same approval
- **THEN** each channel sends it once

#### Scenario: Expo refuses

- **WHEN** Expo refuses the push to every phone
- **THEN** the push step fails and Inngest retries it, and the email and Telegram steps are not sent again

### Requirement: Alert types

The service SHALL alert on rule actions (an ad or a campaign paused, every campaign stopped), scale requests, approvals waiting, the first sale, a merchant's job that failed after its retries, and suggestions and finished runs. A run's failure SHALL keep its own email and SHALL NOT also send a failure alert.

#### Scenario: First sale

- **WHEN** the shop's first order is detected
- **THEN** the merchant gets one first-sale alert, never a second

#### Scenario: Job failed

- **WHEN** the optimizer tick for a merchant fails after its retries
- **THEN** the merchant gets a failure alert naming the job

### Requirement: Channels per type and quiet hours

Settings > Alerts SHALL let the merchant pick the channels of each alert type and set quiet hours in their time zone. During quiet hours, push and Telegram SHALL wait until the hours end, and email SHALL go at once.

#### Scenario: Quiet hours

- **WHEN** a rule pauses an ad at 01:00 for a merchant with quiet hours 22:00 to 07:00
- **THEN** the email goes at once and the push and Telegram message go at 07:00

### Requirement: Telegram linked from Settings

Settings SHALL connect Telegram with a deep link `t.me/<bot>?start=<token>`. The token SHALL be single use, valid 15 minutes and stored only as a hash. The bot's webhook SHALL accept only updates carrying the bot's secret token, and SHALL link only private chats. A chat that blocked the bot SHALL be unlinked.

#### Scenario: Expired link

- **WHEN** the merchant presses Start on a link older than 15 minutes
- **THEN** the bot says the link expired and no chat is linked

### Requirement: Bot token per environment in IaC

The bot token SHALL be the `telegram-bot-token-<env>` Secret Manager secret, created by Pulumi for next and dev only. Production SHALL have none.

#### Scenario: Environment without a bot

- **WHEN** an environment has no bot token
- **THEN** Settings shows Telegram as not set up, and Telegram alerts are skipped
