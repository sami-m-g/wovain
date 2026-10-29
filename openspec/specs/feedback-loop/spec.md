# feedback-loop Specification

## Purpose

What a merchant's products and ads did once for sale (Fourthwall sales, Meta results) flows back into wovain: daily snapshots, learnings in taste memory and the research prompt, and per-brand idea-score weights fit around the defaults.

## Requirements

### Requirement: Daily performance snapshots

While the `feedback-loop` flag is on for a merchant, the system SHALL save one `performance_snapshot` row per UTC day for each wovain product, drop, Meta campaign and Meta ad. Rows SHALL be upserted on `(user, source, level, entity, date)`, so a rerun never double counts. A daily schedule SHALL snapshot the last 3 days. A source's first snapshot SHALL read back to the day the oldest public product went on sale, at most 28 days, so products already for sale have their results.

#### Scenario: Rerun on the same day

- **WHEN** the snapshot runs twice on one day
- **THEN** each entity has one row for that day, holding the latest numbers

#### Scenario: First snapshot

- **WHEN** a merchant's products went on sale 19 days ago and the loop runs for the first time
- **THEN** the snapshot reads all 19 days, and the next one reads the last 3

### Requirement: One run per merchant

The daily schedule SHALL run each merchant's loop on its own, one at a time per merchant, so a merchant whose loop fails never stops the others. A loop that still fails after its retries SHALL be logged at error level.

#### Scenario: One merchant fails

- **WHEN** the loop fails for one merchant after its retries
- **THEN** the other merchants' loops still run, and the failure reaches PostHog Error Tracking

### Requirement: Snapshot contents and failures

Fourthwall rows SHALL hold units and revenue, and drop rows SHALL also hold sell-through (published products and products with a sale). Meta rows SHALL hold spend, impressions, clicks and ROAS. A provider that fails SHALL be logged at error level, and the other provider's rows SHALL still be saved.

#### Scenario: Meta fails

- **WHEN** the Meta read fails and Fourthwall answers
- **THEN** the Fourthwall rows are saved and the Meta failure reaches PostHog Error Tracking

### Requirement: Learnings in taste memory and research

The system SHALL turn the outcomes of ideas whose products have been public for at least 3 days into learnings: up to 3 ideas that sold and up to 3 that didn't. A product's outcome SHALL sum its first 28 days for sale. A product that went on sale before the merchant's sales snapshots began SHALL NOT count, because its results are incomplete. The system SHALL write the learnings into the merchant's working memory, and SHALL NOT pass them to a theme prompt: themes come from Qloo alone.

#### Scenario: A theme sold

- **WHEN** a product of the idea "Retro slasher VHS" sold 4 units
- **THEN** the merchant's working memory lists it under what sold

#### Scenario: A product older than the snapshots

- **WHEN** a product went on sale before the merchant's first sales snapshot and has no sales since
- **THEN** its idea is not counted and is not listed under what didn't sell

### Requirement: Versioned per-brand score weights

The system SHALL re-fit the idea score weights per merchant from the ideas' outcomes, using the default weights as the prior. Each weight SHALL stay within ±50% of its default before normalisation, and the weights SHALL sum to 1. With fewer than 3 counted ideas, the defaults SHALL stay. Each fit SHALL be saved as a decision trace with a version that goes up only when a weight changed. Research SHALL score ideas with the merchant's latest weights.

#### Scenario: Not enough data

- **WHEN** a merchant has 2 counted ideas
- **THEN** research uses the default weights at version 0

#### Scenario: Recency predicts sales

- **WHEN** across 12 counted ideas the fresher ideas sold more
- **THEN** the recency weight goes up, no weight leaves its bound, and the version goes up by one

### Requirement: One fit at a time

A merchant's fits SHALL run one at a time, so two fits never save the same new version.

#### Scenario: Two fits at once

- **WHEN** the daily run and "Check results now" fit the same merchant at the same time
- **THEN** one fit waits for the other, and only one of them can save a new version

### Requirement: What we learned

The Insights page SHALL show, behind the `feedback-loop` flag, the learnings, each weight against its default, the weights' version and how many ideas the fit used. It SHALL say plainly when there isn't enough data yet. Each learning SHALL show in the merchant's language, with numbers in their locale's format. The merchant SHALL be able to ask for a fresh snapshot and fit; within 5 minutes of the last fit, the request SHALL show that fit instead of reading the providers again.

#### Scenario: Asked twice in a row

- **WHEN** the merchant asks for fresh results twice within 5 minutes
- **THEN** the second request reads no provider and shows the first fit

#### Scenario: Flag off

- **WHEN** the `feedback-loop` flag is off
- **THEN** the panel is hidden and the procedures answer 404

### Requirement: Outcomes per design

While the `feedback-loop` flag is on, the system SHALL keep one `design_outcome` row per published product of the merchant. The row SHALL hold the design's angles: theme, Qloo tags (the idea's and its drop's), Qloo entities, top Qloo audience, palette, price, blank and drop. It SHALL hold Meta's lifetime spend, clicks, impressions, add-to-carts and purchases for the design's ads, and Fourthwall's units and revenue. Rows SHALL be upserted on `(user, product)`.

#### Scenario: Rerun

- **WHEN** the daily loop runs twice for a merchant with three published designs
- **THEN** there are three outcome rows, holding the latest numbers

#### Scenario: Meta numbers kept

- **WHEN** the optimizer tick recorded a design's Meta numbers and the daily loop later runs without reading Meta
- **THEN** the design keeps the Meta numbers from the tick

### Requirement: When outcomes are recorded

The optimizer tick SHALL update Meta's numbers for the campaigns it read. The daily loop SHALL update every row. A design's sales SHALL be Fourthwall's units when the sales snapshots cover its launch day, and Meta's purchases otherwise. A failure SHALL be logged at error level and SHALL NOT stop the tick or the loop.

#### Scenario: Meta fails in the daily loop

- **WHEN** Meta can't be read during the daily loop
- **THEN** the angles and Fourthwall's numbers are still recorded, and the failure reaches PostHog Error Tracking

### Requirement: What sells, learned per merchant

The system SHALL treat each design that has been for sale 3 days or more, or that already made a profit, as one trial. A trial is a win when sales times the profit per sale, minus ad spend, is above 0. The merchant's base rate SHALL be their win rate shrunk toward a global rate with the weight of 10 designs. The global rate SHALL be pooled from counts only, across all merchants, once 30 designs count; 0.2 SHALL be used before that.

#### Scenario: A new merchant's base rate

- **WHEN** a merchant has no counted design and fewer than 30 designs count across merchants
- **THEN** their base rate is 0.2

### Requirement: Confident angles

Each angle SHALL get a Beta posterior with the merchant's base rate as its prior mean and a prior weight of 8 designs. An angle SHALL be called a winner only when the posterior probability that its rate beats the base rate is at least 0.8 and its designs made a profit. It SHALL be called a loser only when that probability is at most 0.2 and its designs made none.

#### Scenario: One lucky sale

- **WHEN** a merchant's only design sold once
- **THEN** its angles move little from neutral, and no angle is called a winner

#### Scenario: A proven angle

- **WHEN** six cottagecore designs made a profit and six gothic ones did not
- **THEN** cottagecore is a winner and gothic a loser

### Requirement: Outcome score for ranking

The system SHALL offer a pure `outcomeScore(idea, model)` that returns a multiplier and the angles behind it. The multiplier SHALL average the log lift of the idea's known angles within each kind first, then across kinds. It SHALL stay between 0.5 and 2. It SHALL be 1 when the merchant has no counted design or the idea shares no angle with them. When a confident angle backs the score, the result SHALL carry it as the reason.

#### Scenario: A new merchant

- **WHEN** an idea is scored for a merchant with no outcomes
- **THEN** its multiplier is 1

### Requirement: Track record on Insights

What we learned SHALL list the merchant's confident angles, winners first. Each angle SHALL show as a sentence in the merchant's language, with money in their locale's format. A winner reads like "Why this: your last 2 cottagecore drops made $84", and a loser says what it lost. It SHALL say how many designs counted and how many made a profit, and say plainly when no angle stands out yet.

#### Scenario: Not enough evidence

- **WHEN** no angle reaches the confidence bar
- **THEN** the panel says that no angle stands out yet
