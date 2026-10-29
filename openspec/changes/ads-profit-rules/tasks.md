# Tasks

Issue #138.

## 1. Rules

- [x] 1.1 `@wovain/core/ad-rules`: defaults, merchant overrides, targets from unit economics, kill, stop and scale decisions
- [x] 1.2 Meta read: purchases, add-to-carts, campaign spend today and this month
- [x] 1.3 Protective stops in the approval policy

## 2. Optimizer

- [x] 2.1 The flow runs the stop rules for the merchant, then the kill and scale rules for each campaign, behind `ads-profit-rules`
- [x] 2.2 Every 30 minutes on Inngest
- [x] 2.3 Decision trace entries with numbers, approvals and `wovain/notify` events
- [x] 2.4 Tests with a fake Meta connection

## 3. Merchant

- [x] 3.1 `loss_limit_cents` and `ad_rules` on `autonomy_setting`, with a migration
- [x] 3.2 `campaigns.rules` and `campaigns.setLossLimit`
- [x] 3.3 The campaign card shows the rules and the loss limit field
