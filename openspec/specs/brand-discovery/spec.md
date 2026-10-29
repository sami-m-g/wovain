# brand-discovery Specification

## Purpose

Guide a newcomer with no niche to a brand: starter brands that Qloo decides (Suggest for me, or a short questionnaire), ranked in code with Tavily momentum and saturation, palettes held to the real colours of the Fourthwall blank, and plain, explained fields.

## Requirements

### Requirement: Starter brands decided by Qloo

While the `brand-discovery` flag is on, the onboarding brand step SHALL offer "Suggest for me", "Ask me a few questions" and "I already know my brand". Suggest for me and the questionnaire SHALL return up to 5 starter cards, each grown from one Qloo input: a Qloo audience, or one thing the merchant loves. With the flag off, `onboarding.discover` and `onboarding.buyers` SHALL answer 404 and the step SHALL show the manual form only.

#### Scenario: Suggest for me

- **WHEN** a newcomer chooses Suggest for me
- **THEN** cards appear within about 20 s, each with references Qloo returned for its input, and "Show me others" asks for a new set of inputs

#### Scenario: Different answers

- **WHEN** two questionnaires name different audiences
- **THEN** their first cards differ in niche, references and palette

#### Scenario: Flag off

- **WHEN** the `brand-discovery` flag is off
- **THEN** `onboarding.discover` answers 404 and the brand step shows the fields without the chooser

### Requirement: What a starter card shows

Each starter card SHALL show 3 to 5 taste references that are Qloo entities, who buys from Qloo demographics, the themes from Qloo tags, a palette, 2 or 3 product ideas on Fourthwall blank kinds, a "why it could sell" line, and the evidence: the Qloo taste match, recent news with links and the saturation level.

#### Scenario: Evidence on a card

- **WHEN** a card is shown
- **THEN** its numbers (taste match, recent stories, similar listings) come from Qloo and Tavily, with the news linked

### Requirement: Code ranks, the model writes

The system SHALL rank cards in code by Qloo affinity x momentum x low saturation. Nemotron SHALL only write the name, the niche, example voice lines, palettes and product ideas, through the model router, validated by a schema. No two cards SHALL share a niche, a reference or a palette.

#### Scenario: Crowded niche

- **WHEN** one input's niche has 15 near-identical listings in 20 marketplace results and another's has none
- **THEN** the crowded card ranks below the open one and says "Crowded"

### Requirement: No suggestion without Qloo

When every Qloo request for the suggestions fails, the system SHALL answer an error and the step SHALL show a retry; it SHALL NOT suggest anything made without Qloo. When Qloo finds too little for an input, that card SHALL be left out rather than filled in.

#### Scenario: Qloo down

- **WHEN** Qloo answers 503 to every insights request
- **THEN** discovery answers 502, no model is called, and the step shows "Try again"

### Requirement: Palettes fit the blank

A suggested palette SHALL have 1 to 3 garment colours the Fourthwall blank comes in and 2 to 5 ink colours, each with a contrast ratio of at least 3:1 on every chosen garment colour. An ink that fails SHALL be shifted toward white or black until it passes, else dropped. A garment colour the blank doesn't offer, or whose hex wovain doesn't know, SHALL NOT be suggested.

#### Scenario: Pale ink on a pale shirt

- **WHEN** the model proposes butter-yellow ink on an Ivory tee
- **THEN** the ink is darkened until it reads at 3:1, and the change is in the trace

#### Scenario: Colour the blank lacks

- **WHEN** the model proposes Navy for a blank that comes in Pepper, Ivory and Sage
- **THEN** Navy is not offered

### Requirement: Fields explained and suggested

The brand step's niche, references, voice and colours SHALL each have a one-line description and a keyboard-reachable tooltip with an example. Picking a card SHALL fill all four, and each field SHALL offer 2 or 3 alternatives from the card. Voice SHALL be chosen from example lines and colours from swatch sets shown on the shirt colours; free text and hex codes SHALL be optional.

#### Scenario: Use a card

- **WHEN** the newcomer picks a card
- **THEN** the niche, references, voice and colours are filled and stay editable

### Requirement: References checked as you go, and Your buyers

Each reference SHALL be checked when its field loses focus and show its status in plain words, without a lookup button. A "Your buyers" panel SHALL show from Qloo who the buyers are, what else they love and 2 or 3 themes, each with a line on what it means for what to sell, and the step SHALL credit "Taste data by Qloo".

#### Scenario: Reference Qloo can't place

- **WHEN** a reference matches nothing
- **THEN** the field says "We couldn't place this one. Try a more specific artist, film or brand."

### Requirement: Traced and free

Each discovery step SHALL be saved in the decision trace. Discovery in onboarding SHALL spend no credits and SHALL be limited to 12 runs per merchant per hour.

#### Scenario: Limit reached

- **WHEN** a merchant asks for a 13th set of suggestions within an hour
- **THEN** the answer is 429 with when to try again
