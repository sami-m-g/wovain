# Spec Delta

## ADDED Requirements

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
