# Tasks

Issue #196.

## 1. Core and data

- [x] 1.1 `@wovain/core/alerts`: alert types, channels, defaults, quiet hours and the channel plan
- [x] 1.2 Notify kinds `rule_action`, `scale_request`, `first_sale`, `failure`; `dedupeKey`, `url` and event ids
- [x] 1.3 `autonomy_setting.alerts`, `telegram_chat`, `alert_delivery` with a migration
- [x] 1.4 The `alerts` flag (dev and next)

## 2. Channels

- [x] 2.1 The `alert` email in en, es and fr
- [x] 2.2 Expo push and `devices.register` / `devices.unregister`
- [x] 2.3 The Telegram bot: deep link, webhook with its secret token, unlink on block

## 3. Service

- [x] 3.1 `alerts-deliver`: one step per channel, quiet hours, once per key and channel, failures at error level
- [x] 3.2 `alerts-approval-requested` and `alerts-job-failed`
- [x] 3.3 The profit rules and the first-sale milestone send alerts
- [x] 3.4 Tests on PGlite with fake email, Expo and Telegram

## 4. Merchant and ops

- [x] 4.1 Settings > Alerts
- [x] 4.2 `telegram-bot-token` for next and dev in IaC
- [x] 4.3 The Alerts guide page and the landing FAQ
