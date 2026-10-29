# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/196

## Why

The profit rules (#141) pause ads, stop campaigns and ask to raise budgets every 30 minutes, and each action sends a `wovain/notify` event. Nothing delivers those events, so the merchant learns about a pause only when they open wovain. The same is true for approvals waiting, a first sale and jobs that fail. A merchant who trusts wovain with ad money must hear about it where they are: their inbox, their phone or Telegram.

## What Changes

- One alerts service on Inngest owns `wovain/notify`. It reads the merchant's settings and sends each channel in its own step:
  - email through Resend (`packages/email`, a new `alert` email in en, es and fr);
  - mobile push through the Expo Push Service (`expo-server-sdk`), to the device tokens the Expo app (#86) saves with `devices.register`;
  - Telegram through wovain's bot (grammY's Bot API client). The merchant connects from Settings with a deep link `t.me/<bot>?start=<token>`; the bot's webhook (`/api/telegram`, checked with Telegram's secret token) links the chat.
- Idempotent: each alert is sent at most once per merchant, key and channel (a new `alert_delivery` table). Producers set the event id, so Inngest drops repeats. A channel step that fails is retried by Inngest. A channel that fails for good is logged at error level and recorded.
- Alert types and their producers:
  - rule actions (pause an ad or a campaign, stop at a cap) and scale requests, from the profit rules (`rule_action` and `scale_request` kinds);
  - approvals waiting, from `wovain/approval.requested`;
  - the first sale, from the `first_sale` milestone;
  - failures, from Inngest's `inngest/function.failed` for a merchant's job (runs keep their own email);
  - suggestions and finished runs (`updates`).
- Settings > Alerts: which channels each alert type uses, quiet hours (push and Telegram wait until they end; email goes at once), and the Telegram and phone links.
- The Telegram bot token is the `telegram-bot-token` secret, created by Pulumi for next and dev only (`infra/settings.ts`). Production has none.
- Behind the new `alerts` flag: on in dev and next, off in production.

## Capabilities

### New Capabilities

- `alerts`: delivery of alerts on email, push and Telegram, per-type channels, quiet hours.

## Impact

- `packages/core`: `alerts.ts` (types, defaults, quiet hours, plan), `events.ts` (notify kinds, `dedupeKey`, `url`, event `id`), `flag-registry.ts`
- `packages/db`: `autonomy_setting.alerts`, `telegram_chat`, `alert_delivery` (migration `alerts`)
- `packages/email`: the `alert` email
- `packages/api`: `flow/alerts.ts`, `flow/push.ts`, `flow/telegram.ts`, `workflows/alerts.ts`, routers `alerts` and `devices`; the profit rules send `rule_action` and `scale_request`; milestone detection sends the first sale
- `apps/web`: Settings > Alerts, `/api/telegram`, `TELEGRAM_BOT_TOKEN` and `EXPO_ACCESS_TOKEN`; messages in en, es and fr
- `infra`: `telegram-bot-token-<env>` for next and dev
- Docs: the Alerts guide page in en, es and fr; the landing FAQ
