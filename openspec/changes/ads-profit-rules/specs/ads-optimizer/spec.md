# Spec Delta

## MODIFIED Requirements

### Requirement: Scheduled optimizer behind a flag

Every 30 minutes, and when a `wovain/optimizer.tick` event arrives, the optimizer SHALL review each wovain campaign of each merchant for whom the `ads-optimizer` flag is on. It SHALL skip a campaign that is not active on Meta. With the flag off it SHALL read nothing and change nothing.

#### Scenario: Flag off

- **WHEN** the optimizer runs for a merchant with `ads-optimizer` off
- **THEN** it makes no Meta call, saves no state and queues nothing

#### Scenario: Campaign still paused

- **WHEN** a wovain campaign is still paused on Meta
- **THEN** the optimizer proposes nothing for it and the decision trace says why

## ADDED Requirements

### Requirement: Kill rules from profit per sale

While `ads-profit-rules` is on, the target CPA SHALL be one sale's profit. The optimizer SHALL pause a running ad, even while learning, at:

- 1x target CPA spent with no purchase and no add-to-cart
- 2x target CPA spent with add-to-carts but no purchase
- CTR under 0.8% after 1,000 impressions
- CPC over $1.50 after 10 clicks

It SHALL pause the campaign when every running ad fails or a sale leaves no profit. Each threshold SHALL be a merchant setting.

#### Scenario: No sale at the target CPA

- **WHEN** a product leaves $10 of profit per sale and one of two running ads has spent $10 with no purchase and no add-to-cart
- **THEN** the optimizer pauses that ad and the other ad keeps running

#### Scenario: Add-to-carts buy time

- **WHEN** that ad has spent $15 with 2 add-to-carts and no purchase
- **THEN** it keeps running until it has spent $20

#### Scenario: Every ad fails

- **WHEN** every running ad of a campaign breaks a kill rule
- **THEN** the optimizer pauses the campaign

### Requirement: Stops at the caps and the loss limit

While the `ads-profit-rules` flag is on, the optimizer SHALL pause every running wovain campaign of the merchant when today's spend reaches the daily spend cap, when this month's spend reaches the monthly spend cap, or when total ad spend minus the profit of the sales it brought reaches the merchant's loss limit. The loss limit SHALL default to $50, and the merchant SHALL be able to set it.

#### Scenario: Loss limit reached

- **WHEN** the merchant's campaigns have spent $70 and their 2 sales left $20 of profit, with a $50 loss limit
- **THEN** the optimizer pauses every running campaign and the trace shows $70, $20 and $50

#### Scenario: Daily cap reached

- **WHEN** today's spend reaches the merchant's $20 daily cap
- **THEN** the optimizer pauses every running campaign

### Requirement: Protective pauses run at once

A pause queued by a kill or stop rule SHALL be marked protective. The approval policy SHALL allow a protective pause at every autonomy level, and when the agent is paused, because it only lowers spend. A protective action that starts or raises spend SHALL NOT be allowed on that ground.

#### Scenario: Merchant at level suggest

- **WHEN** a kill rule pauses an ad for a merchant at level `suggest`
- **THEN** the approval is approved by the policy with reason `protective_stop` and the ad is paused on Meta

### Requirement: Scale only proven sellers

While the `ads-profit-rules` flag is on, the optimizer SHALL propose a raise only when the ad set is not learning, the campaign has at least 3 purchases, its ROAS is at least 1.3 times break-even ROAS, and its last raise was 48 or more hours ago. A raise SHALL be at most 20%, SHALL stay within the daily cap and SHALL wait for the merchant. The bandit SHALL NOT raise a budget on clicks.

#### Scenario: Proven seller

- **WHEN** a $30 tee with $10 of profit per sale (break-even ROAS 3.0) has 4 purchases on $30 of spend (ROAS 4.0), and its last raise was 3 days ago
- **THEN** the optimizer proposes raising its $10 daily budget to $12, and the approval waits for the merchant

#### Scenario: Too soon

- **WHEN** the same campaign was raised 24 hours ago
- **THEN** the optimizer proposes no raise and the trace says why

### Requirement: Every rule action is traced and announced

Each kill, stop or scale action SHALL be written to the decision trace with the rule and its numbers. It SHALL be queued as an optimizer approval with an idempotency key per campaign, rule, target and day, and announced to the merchant with a `wovain/notify` event.

#### Scenario: A kill is announced

- **WHEN** a kill rule pauses an ad
- **THEN** the trace holds the rule, the spend and the limit, and a `wovain/notify` event names the ad and the reason
