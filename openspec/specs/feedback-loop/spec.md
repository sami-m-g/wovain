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

The system SHALL turn the outcomes of ideas whose products have been public for at least 3 days into learnings: up to 3 ideas that sold and up to 3 that didn't. A product's outcome SHALL sum its first 28 days for sale. A product that went on sale before the merchant's sales snapshots began SHALL NOT count, because its results are incomplete. The system SHALL write the learnings into the merchant's working memory and pass them to the `research_themes` prompt as data, never as instructions.

#### Scenario: A theme sold

- **WHEN** a product of the idea "Retro slasher VHS" sold 4 units
- **THEN** the next research prompt and the merchant's working memory list it under what sold

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
