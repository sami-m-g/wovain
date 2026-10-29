## ADDED Requirements

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
