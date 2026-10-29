# Design

## Context

`wovain/notify` already exists (`@wovain/core/events`) and the profit rules, autopilot and approvals send it. The Expo app (#86) has a server-side push function, but it is not merged and is based on an older main. The `device` table for Expo push tokens is in the foundation schema.

## Decisions

### One function owns `wovain/notify`

`alerts-deliver` plans the channels from the merchant's settings, then runs one Inngest step per channel (`send-email`, `send-push`, `send-telegram`). Inngest retries a step alone and memoizes a step that succeeded, so a retry never sends a channel twice inside one run. Across runs (the same event sent twice, or an approval alerted by both the profit rules and `alerts-approval-requested`), the `alert_delivery` row, unique on merchant, key and channel, makes the second send a no-op. The key is the event's `dedupeKey`, or its id. Producers also set the event id, so Inngest drops repeats within 24 hours (Inngest docs: "Deduplication").

When a step fails for good, `onFailure` logs the error at error level through evlog (PostHog Error Tracking) and records the channel as failed.

#86's `push-notify` function must not also consume `wovain/notify` when it is rebased: its push code moved here (`flow/push.ts`, `devices.register` and `devices.unregister` with the same inputs).

### Quiet hours hold push and Telegram

A phone notification or a Telegram message wakes the merchant; an email does not. During quiet hours, push and Telegram wait with `step.sleepUntil` until the hours end, and email goes at once. Quiet hours are local times in an IANA time zone (the browser's, saved with them).

### Telegram

- grammY's `Api` (grammy.dev) for `sendMessage`, `setWebhook`, `getWebhookInfo` and `getMe`, rather than hand-written HTTP.
- Linking uses Telegram's deep link `t.me/<bot>?start=<token>` (core.telegram.org/bots/features#deep-linking). The token is 32 base64url characters (the start parameter allows up to 64 of `A-Z a-z 0-9 _ -`), valid 15 minutes and stored only as its SHA-256.
- The webhook checks `X-Telegram-Bot-Api-Secret-Token`, a secret derived from the bot token and set with `setWebhook` (core.telegram.org/bots/api#setwebhook). The app sets the webhook itself when the merchant connects, so there is no manual step; the price is one bot per environment.
- Only private chats link. A chat that blocked the bot is unlinked on the next send.

### Push

Expo Push Service through `expo-server-sdk` (docs.expo.dev/push-notifications/sending-notifications). A ticket with `DeviceNotRegistered` deletes the token. When every ticket fails for another reason, the step throws and Inngest retries.

### Failures

Inngest sends `inngest/function.failed` with the trigger event when a function fails after its retries. A failure alert goes out only when that event names a merchant (`userId`), and never for an alerts function (no loops) or the run workflow (runs already email the merchant).

## Risks

- One bot per environment: if two environments shared a token, each connect would move the webhook. `infra/README.md` says so.
- Alert titles and bodies come from the producers in English. The email heading, the button and the footer are localized; translating producers' text is later work.
