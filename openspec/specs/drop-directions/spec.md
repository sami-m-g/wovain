# drop-directions Specification

## Purpose

Open each new drop with what to sell now, with or without a brand: directions Qloo finds rising (across audiences, or among the brand's fans), ranked in code with Tavily momentum and marketplace saturation, shown as one-click cards with their evidence, and never made without Qloo.

## Requirements

### Requirement: What to sell now, no brand needed

The new-drop step SHALL open with up to 5 directions to sell now, without a brand and without a typed seed. With no brand (or "Ignore my brand this time" on), each direction SHALL grow from one Qloo audience: the genre tag shared by what is rising among its fans. "Show me others" SHALL ask for a new set of audiences. The free-text brief SHALL stay.

#### Scenario: No brand

- **WHEN** a merchant with no brand opens the new-drop step
- **THEN** they see 3 to 5 directions, each naming the Qloo audience it is for, and no step asks them to set a brand first

#### Scenario: Show me others

- **WHEN** the merchant clicks "Show me others"
- **THEN** the directions come from a different set of Qloo audiences

### Requirement: Behind the drop-directions flag

The directions SHALL show only while the `drop-directions` flag is on. With the flag off, `runs.directions` SHALL answer 404 and the step SHALL show the brief only.

#### Scenario: Flag off

- **WHEN** the `drop-directions` flag is off
- **THEN** `runs.directions` answers 404 and the step shows the free-text brief only

### Requirement: Within the brand when there is one

When the merchant has a brand with Qloo references, the directions SHALL stay within it: the tags carried by what Qloo finds rising among the fans of the brand's references, a tag that only restates the brand's niche left out. "Ignore my brand this time" SHALL switch to the audience directions for this drop only.

#### Scenario: Different brands

- **WHEN** two brands with different Qloo references open the new-drop step
- **THEN** their directions differ

#### Scenario: Ignore the brand

- **WHEN** a merchant with a brand turns on "Ignore my brand this time"
- **THEN** the directions come from Qloo audiences, and the brand is unchanged

### Requirement: Ranked by sales potential

The system SHALL rank directions in code by Qloo affinity x momentum (Tavily news in the past month) x low saturation (near-identical marketplace listings). Nemotron SHALL only write the title, the brief and the "why now" line, validated by a schema; when the words fail, the directions SHALL still be shown with plain words from their facts.

#### Scenario: Crowded theme

- **WHEN** one direction's theme has many near-identical listings and another's has none
- **THEN** the crowded one ranks lower and says how many similar listings there are

### Requirement: One-click cards with evidence

Each direction SHALL be a card with a title, a "why now" line, the audience (when it grew from one), the rising Qloo entities, the news count with links, and the similar-listings count. Clicking it SHALL start the drop with its brief.

#### Scenario: Start from a direction

- **WHEN** the merchant clicks a direction
- **THEN** a run starts with that direction's brief as its seed

### Requirement: Never without Qloo

Every direction SHALL come from Qloo. When every Qloo call fails, the request SHALL fail with `DISCOVERY_QLOO_FAILED`, the step SHALL offer a retry, and no Tavily or Nemotron call SHALL be made. With the `trends-qloo` kill switch off, the request SHALL answer `QLOO_OFF`.

#### Scenario: Qloo down

- **WHEN** Qloo answers 503 to every call
- **THEN** the step shows the failure and a Try again button, and no direction is shown

### Requirement: Traced, free and limited

Each request SHALL be saved as a decision trace (agent `drop_directions`, with the scope: brand or open). Directions SHALL cost no credits, and each merchant SHALL make at most 20 requests an hour.

#### Scenario: Over the limit

- **WHEN** a merchant asks for directions a 21st time in an hour
- **THEN** the request answers 429 `DIRECTIONS_LIMIT`
