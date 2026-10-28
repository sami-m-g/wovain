# feedback-loop Specification

## Purpose

What a merchant's products and ads did once for sale (Fourthwall sales, Meta results) flows back into wovain: daily snapshots, learnings in taste memory and the research prompt, and per-brand idea-score weights fit around the defaults.

## Requirements

### Requirement: Daily performance snapshots

While the `feedback-loop` flag is on for a merchant, the system SHALL save one `performance_snapshot` row per UTC day for each wovain product, drop, Meta campaign and Meta ad. Rows SHALL be upserted on `(user, source, level, entity, date)`, so a rerun never double counts. A daily schedule SHALL snapshot the last 3 days.

#### Scenario: Rerun on the same day

- **WHEN** the snapshot runs twice on one day
- **THEN** each entity has one row for that day, holding the latest numbers

### Requirement: Snapshot contents and failures

Fourthwall rows SHALL hold units and revenue, and drop rows SHALL also hold sell-through (published products and products with a sale). Meta rows SHALL hold spend, impressions, clicks and ROAS. A provider that fails SHALL be logged at error level, and the other provider's rows SHALL still be saved.

#### Scenario: Meta fails

- **WHEN** the Meta read fails and Fourthwall answers
- **THEN** the Fourthwall rows are saved and the Meta failure reaches PostHog Error Tracking

### Requirement: Learnings in taste memory and research

The system SHALL turn the outcomes of ideas whose products have been public for at least 3 days into learnings: up to 3 ideas that sold and up to 3 that didn't. It SHALL write them into the merchant's working memory and pass them to the `research_themes` prompt as data, never as instructions.

#### Scenario: A theme sold

- **WHEN** a product of the idea "Retro slasher VHS" sold 4 units
- **THEN** the next research prompt and the merchant's working memory list it under what sold

### Requirement: Versioned per-brand score weights

The system SHALL re-fit the idea score weights per merchant from the ideas' outcomes, using the default weights as the prior. Each weight SHALL stay within ±50% of its default before normalisation, and the weights SHALL sum to 1. With fewer than 3 counted ideas, the defaults SHALL stay. Each fit SHALL be saved as a decision trace with a version that goes up only when a weight changed. Research SHALL score ideas with the merchant's latest weights.

#### Scenario: Not enough data

- **WHEN** a merchant has 2 counted ideas
- **THEN** research uses the default weights at version 0

#### Scenario: Recency predicts sales

- **WHEN** across 12 counted ideas the fresher ideas sold more
- **THEN** the recency weight goes up, no weight leaves its bound, and the version goes up by one

### Requirement: What we learned

The Insights page SHALL show, behind the `feedback-loop` flag, the learnings, each weight against its default, the weights' version and how many ideas the fit used. It SHALL say plainly when there isn't enough data yet. The merchant SHALL be able to ask for a fresh snapshot and fit.

#### Scenario: Flag off

- **WHEN** the `feedback-loop` flag is off
- **THEN** the panel is hidden and the procedures answer 404
