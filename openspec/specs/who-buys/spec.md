# who-buys Specification

## Purpose

Show who buys each idea and where before any connector, from Qloo alone: the age and gender lean, the audiences an ad can target, the cities with the most fans and the fashion brands they wear, every value traced to Qloo and never guessed.

## Requirements

### Requirement: Who buys each idea, before any connector

While the `who-buys` flag is on, each idea card SHALL show who buys it, from Qloo alone and without any connection: the age and gender lean, up to 5 Qloo audiences, up to 5 cities with their affinity, and up to 3 fashion brands the fans like. With the flag off, `ideas.whoBuys` SHALL answer 404 and the card SHALL not show it.

#### Scenario: No connection

- **WHEN** a merchant with no Meta or Fourthwall connection opens an idea
- **THEN** the card shows the age and gender lean, the audiences, "Where your buyers are" and "They also buy"

#### Scenario: Different ideas

- **WHEN** two ideas have different Qloo entities
- **THEN** their places and brands differ

### Requirement: Targetable audiences and real markets

The audiences SHALL leave out the families an ad may not target (communities, politics, beliefs, global issues, investing, professions). The cities SHALL be ranked by Qloo affinity x popularity within one country, the United States unless another is asked for.

#### Scenario: Sensitive audience

- **WHEN** Qloo ranks "LGBTQ (Communities)" first
- **THEN** it is not shown, and the next targetable audiences are

### Requirement: Never a guess

Every value SHALL come from Qloo. When a Qloo call fails, the request SHALL fail with `WHO_BUYS_QLOO_FAILED`, logged at error level, and the card SHALL offer a retry. An idea without Qloo data SHALL answer `WHO_BUYS_NO_SIGNAL`. With the `trends-qloo` kill switch off, the request SHALL answer `QLOO_OFF`.

#### Scenario: Qloo down

- **WHEN** Qloo's places call fails
- **THEN** the card shows the failure and Try again, and nothing else

### Requirement: Traced and kept

Each read SHALL be saved in the decision trace (agent `who_buys`, step `who.buys`) with every audience, place and brand as a Qloo source, and kept on the idea for its country.

#### Scenario: Second view

- **WHEN** the merchant opens the same idea again
- **THEN** the kept answer is shown without asking Qloo again
