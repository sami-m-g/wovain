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

Nemotron SHALL judge title, description, idea fit, originality and the garment rule from the brief, and a vision model SHALL judge the drawn artwork image. The judge SHALL return `ready` or `revise`, a score and up to five fixes. The print-size check SHALL be computed by code and the image checks SHALL come from the vision model; both SHALL override the text model.

The image checks SHALL be: the subject is not a garment, mockup or clothing; there is no background and nothing is cropped; readable printed text matches the brief; and the art shows on each listed garment color.

#### Scenario: Art too small

- **WHEN** the art does not meet the blank's print size
- **THEN** the verdict is `revise` whatever the model said

#### Scenario: Art is a picture of a garment

- **WHEN** the drawn artwork shows a T-shirt or other clothing as its subject
- **THEN** the `garment` check fails and the verdict is `revise`

#### Scenario: Art disappears on a listed color

- **WHEN** the art is dark and the brief lists black and sand
- **THEN** black is dropped from the brief's garment colors and the design can still be `ready`

#### Scenario: Art shows on no listed color

- **WHEN** the art disappears on every listed garment color
- **THEN** the `contrast` check fails and the verdict is `revise`

#### Scenario: Printed text differs from the brief

- **WHEN** the readable text in the art differs from the brief's printed text
- **THEN** the `printed_text` check fails and the verdict is `revise`

### Requirement: Distinct research themes

Research SHALL study 3 to 5 distinct themes for a direction: Qloo's themes first, topped up from the direction by a model when Qloo names fewer than 3, and design angles on the direction's subject when no model answers. A theme SHALL never be the direction itself, and reworded duplicates SHALL be dropped. A model's long theme name SHALL be shortened, never fail the run.

#### Scenario: Qloo names no themes

- **WHEN** a designer researches a direction that Qloo does not match, or Qloo is off or fails
- **THEN** research saves 3 to 5 ideas, each titled with a distinct theme that is not the direction's text

#### Scenario: The model fails

- **WHEN** the theme model is missing or fails
- **THEN** the run continues with design angles on the direction's subject, and the failure is logged at error level

### Requirement: Relevant, recent sources

Each theme SHALL be searched with its own query, not the whole direction. Research SHALL keep a news source only when it is a web page that is not an archive or tag page, is at most 31 days old, has a Tavily relevance score of at least 0.4, and shares a word with the theme's query. Sources SHALL be deduped by page and headline and ranked by relevance and freshness.

#### Scenario: Archive page returned

- **WHEN** Tavily returns an archive page such as "Archive for March 2011"
- **THEN** that page is not saved as a source of any idea
