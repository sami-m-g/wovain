# Spec Delta

## ADDED Requirements

### Requirement: Meta backstop rules

While the `meta-backstop-rules` flag is on, each wovain campaign that can still spend SHALL have Meta Automated Rules on its ad account that pause, checked by Meta every 30 minutes: an ad past 1.2 times the no-sale and add-to-cart-no-sale limits, the campaign past the daily or the monthly cap on its own spend, and the campaign past the loss limit with no purchase. Each rule's name SHALL start with `wovain backstop`, and the merchant's own rules SHALL NOT be changed.

#### Scenario: wovain is down

- **WHEN** an ad spends 1.2 times its no-sale limit while wovain's optimizer isn't running
- **THEN** Meta's rule pauses the ad

#### Scenario: Merchant's own rule

- **WHEN** the ad account has a rule the merchant made
- **THEN** wovain neither changes nor deletes it

### Requirement: Backstop kept in sync

The backstop SHALL be synced on every optimizer tick, and a tick SHALL be requested when the merchant changes a cap or the loss limit. A changed threshold SHALL replace its rule. An archived campaign SHALL lose its rules.

#### Scenario: Loss limit changed

- **WHEN** the merchant raises the loss limit from $50 to $90
- **THEN** the loss-limit rule is replaced with one at $90 and the other rules stay

#### Scenario: Campaign ended

- **WHEN** a campaign is archived
- **THEN** its backstop rules are deleted at the next sync
