# design-generation Specification

## Purpose

Turning a direction into ranked ideas with evidence, and an idea into a priced, judged print design on a real Fourthwall blank.

## Requirements

### Requirement: Evidence-backed ideas

Research SHALL ask Qloo for the direction's entities and taste themes, then Tavily for recent news and marketplace listings inside those themes, and SHALL save ranked ideas with their signals, source links and score inputs.

#### Scenario: Ideas returned

- **WHEN** a designer researches a direction
- **THEN** each saved idea shows its taste signal, moment signal, sources and score inputs

### Requirement: Never print matched names

Names Qloo matched for the direction SHALL be stored on the idea as names to avoid and SHALL never appear in the brief or the art prompt.

#### Scenario: Seed names a brand

- **WHEN** the direction names a brand or person
- **THEN** that name is excluded from the design brief and the art prompt

### Requirement: Priced design

A design SHALL have a Nemotron brief and listing, transparent print art from fal, and a price from the blank's base cost that keeps at least $10 profit and a 30% margin after card fees, sales tax and a refund reserve.

#### Scenario: Price floor

- **WHEN** a design is priced
- **THEN** the price meets both the $10 profit and the 30% margin floor

### Requirement: Judged design

Nemotron SHALL judge title, description, idea fit and originality and return `ready` or `revise`, a score and up to five fixes; the print-size check SHALL be computed by code and override the model.

#### Scenario: Art too small

- **WHEN** the art does not meet the blank's print size
- **THEN** the verdict is `revise` whatever the model said
