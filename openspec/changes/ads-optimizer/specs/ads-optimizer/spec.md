# Spec Delta

## ADDED Requirements

### Requirement: Scheduled optimizer behind a flag

Every 6 hours, and when a `wovain/optimizer.tick` event arrives, the optimizer SHALL review each wovain campaign of each merchant for whom the `ads-optimizer` flag is on. It SHALL skip a campaign that is not active on Meta. With the flag off it SHALL read nothing and change nothing.

#### Scenario: Flag off

- **WHEN** the optimizer runs for a merchant with `ads-optimizer` off
- **THEN** it makes no Meta call, saves no state and queues nothing

#### Scenario: Campaign still paused

- **WHEN** a wovain campaign is still paused on Meta
- **THEN** the optimizer proposes nothing for it and the decision trace says why

### Requirement: Thompson-sampling scores

For each ad of a live campaign, the optimizer SHALL keep a Beta posterior over link clicks per impression, starting from Beta(1, 1). It SHALL save each ad's lifetime impressions, clicks, spend, posterior and its probability of being the best ad in its ad set, estimated by Thompson sampling.

#### Scenario: Clear winner

- **WHEN** one ad has 60 clicks on 2,000 impressions and another has 5 clicks on 2,000
- **THEN** the first ad's probability of being best is above 0.95 and the second's is below 0.05

### Requirement: Learning phase is a floor

The optimizer SHALL propose no change to a campaign while its ad set is learning. An ad set is learning when Meta reports it as learning, when it had fewer than 50 results in the last 7 days, or when wovain made a significant edit to it in the last 7 days.

#### Scenario: Recent edit

- **WHEN** wovain paused an ad in the ad set 3 days ago
- **THEN** the optimizer proposes nothing for that campaign until 7 days have passed

### Requirement: Breakdown effect guard

The optimizer SHALL judge ads within one ad set at the ad set level. It SHALL NOT pause:

- the ad with the most spend in the ad set
- an ad with fewer than 1,000 impressions
- the last active ad

It SHALL pause an ad only when its probability of being best is below 0.05.

#### Scenario: Meta favors the ad with the worse average

- **WHEN** the ad with the most spend has the lowest click-through rate
- **THEN** the optimizer does not propose pausing it

### Requirement: Spend caps are hard limits

The optimizer SHALL change a campaign's daily budget by at most 20% per change, and never below $1. A raise SHALL NOT take the total daily budget of the merchant's wovain campaigns past the daily spend cap. With a daily cap of 0 it SHALL propose no raise. Every budget change SHALL go through the approval policy, which denies a raise past the daily or monthly cap and otherwise waits for the merchant.

#### Scenario: Raise near the cap

- **WHEN** the daily cap is $12, wovain's campaigns budget $10 a day, and a raise to $12 is warranted
- **THEN** the optimizer proposes $12, not more, and the approval waits for the merchant

#### Scenario: No cap set

- **WHEN** the merchant's daily cap is 0
- **THEN** the optimizer proposes no budget raise

### Requirement: Reasoning review

Each proposal SHALL be reviewed by Nemotron on the reasoning model before it is queued. A veto SHALL drop the proposal. A review that fails SHALL drop the proposal and be logged at error level.

#### Scenario: Veto

- **WHEN** the reviewer vetoes a proposed pause
- **THEN** nothing is queued and the decision trace holds the veto and its reason

### Requirement: Writes through the approval queue

Each reviewed proposal SHALL be enqueued as an approval proposed by `optimizer`, with an idempotency key per campaign, action, target and day. An approval that the policy allows SHALL be executed on Meta at once. An approval that waits SHALL be executed only after the merchant approves it. The executor SHALL record `executing`, then `done` or `failed`, on the approval. It SHALL also mark the ad set as edited, so that the learning floor applies again.

#### Scenario: Within the autonomy level

- **WHEN** a merchant at level `draft` gets a proposed ad pause
- **THEN** the policy approves it, the executor pauses the ad on Meta, and the approval ends `done`

#### Scenario: Above the level

- **WHEN** a merchant at level `suggest` gets a proposed ad pause
- **THEN** the approval waits for the merchant and nothing changes on Meta

### Requirement: Decision trace

Every optimizer run SHALL save a decision trace per campaign, listing:

- the Meta read
- the scores
- each guard that stopped a change
- the review, with its model
- the policy decision

The executor SHALL save one trace per approval, linked to that approval.

#### Scenario: Why the ad was paused

- **WHEN** the merchant opens an optimizer approval
- **THEN** its trace shows the ad's counts, its probability of being best, the reviewer's reason and the policy's decision
