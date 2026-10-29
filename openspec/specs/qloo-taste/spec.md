# qloo-taste Specification

## Purpose

How Qloo's taste graph shapes the ideas a run researches, how each idea explains what Qloo contributed, and how the difference Qloo makes is measured.

## Requirements

### Requirement: Qloo in every run

Research SHALL call Qloo in every run, whatever the merchant's plan, and a merchant SHALL have no choice to run without it. Every idea SHALL carry Qloo's taste map, with no flag. `trends-qloo` SHALL be an ops kill switch only, with no plan limit: while it is off, `runs.start` (before saving a run) and research SHALL refuse with `QLOO_OFF`. Flags SHALL be evaluated with the merchant's real plan. A failed Qloo call SHALL fail the research step and be logged at error level.

#### Scenario: Paid plan

- **WHEN** a merchant on a paid plan starts a run
- **THEN** research calls Qloo, and the flag evaluations carry the merchant's paid plan

#### Scenario: Paid plan with the taste map on

- **WHEN** a merchant on a paid plan starts a run, with no flag to turn the taste map on
- **THEN** research asks Qloo for cross-domain affinities and every idea carries Qloo's taste map

#### Scenario: Kill switch off

- **WHEN** a merchant starts a run while `trends-qloo` is off
- **THEN** `runs.start` answers `QLOO_OFF`, and no run is saved or queued

#### Scenario: Qloo fails

- **WHEN** Qloo answers with an error during research
- **THEN** the research step fails, the run fails after its retries, the error is logged at error level, and no idea is saved

### Requirement: Cross-domain affinities in the brief

In every run, research SHALL ask Qloo, with explainability and a trend bias, which brands, artists and films the seed's fans also like. Each affinity SHALL keep its Qloo affinity and the share each matched seed entity contributed. The design brief SHALL receive the affinities' aesthetic cues, and SHALL NOT receive their names.

#### Scenario: Brief from a Qloo-backed idea

- **WHEN** a brief is drafted for an idea whose taste map has cross-domain affinities
- **THEN** the brief's input holds their aesthetic cues and no affinity name

### Requirement: Failed affinity domains

When the affinities call for one domain (brands, films or TV) fails, the error SHALL be logged at error level, the other domains SHALL stand, the idea's taste map SHALL record the failed domains, and the "Why this idea" panel SHALL name the domains it couldn't load.

#### Scenario: One domain fails

- **WHEN** Qloo answers the films call with an error and the brand and TV calls succeed
- **THEN** the error is logged at error level, the idea's taste map lists `movie` as a failed domain with the brand and TV affinities, and the panel says Qloo couldn't load films

### Requirement: Qloo match required

Every idea SHALL be a Qloo taste tag for the entities Qloo matched in the brief. When Qloo matches no entity, or no usable tag, research SHALL stop with the typed error `QLOO_NO_MATCH` and the message "Qloo found no audience for this brief; try naming a band, film, brand or place". It SHALL search nothing on Tavily and SHALL give the step's credits back.

#### Scenario: Brief Qloo can't place

- **WHEN** a merchant starts a run with the brief "asdf qwerty" and Qloo matches nothing
- **THEN** the run fails with `QLOO_NO_MATCH`, no Tavily search runs and no credits are spent

### Requirement: No-match suggestions

A run that failed with `QLOO_NO_MATCH` SHALL show a suggestion panel instead of the generic failure: name a band, film, brand or place, example briefs Qloo knows, and "Write a new brief". It SHALL NOT offer "Try again", because the same brief can't match.

#### Scenario: Example brief

- **WHEN** the merchant picks the example "Studio Ghibli" on the suggestion panel
- **THEN** a new brief opens with "Studio Ghibli" filled in

### Requirement: Qloo's taste map on each idea

Each idea card SHALL show a "Why this idea" panel with the seed entities Qloo matched, the theme's Qloo tag and affinity, and the cross-domain affinities with their contributing entities. An idea saved before Qloo was required, with no matched entity, SHALL show no panel.

#### Scenario: Idea from Qloo

- **WHEN** a designer views an idea
- **THEN** the panel shows the theme's Qloo tag, its affinity, the seed entities and the cross-domain affinities

#### Scenario: Idea saved before Qloo was required

- **WHEN** a designer views an older idea whose taste map has no seed entity
- **THEN** no "Why this idea" panel is shown

### Requirement: Offline Qloo ablation

No product path SHALL run without Qloo. An offline eval SHALL research the same seeds with Qloo's themes and with themes a model splits from the brief alone (an eval-only arm), and SHALL report, for each arm, the share of themes grounded in a Qloo tag, the share of ideas explained by Qloo entities, the number of aesthetic cues, and how far the themes move from the seed's own words.

#### Scenario: Qloo fails during the eval

- **WHEN** any Qloo call fails for a seed during the eval, a single domain's affinities included
- **THEN** the eval fails instead of reporting an understated with-Qloo arm

#### Scenario: Eval without keys

- **WHEN** the eval runs without `QLOO_API_KEY` or `NEBIUS_API_KEY`
- **THEN** the suite is skipped

### Requirement: Qloo affinity required to suggest

An idea's demand SHALL be Qloo's affinity of its theme with the seed's fans, with no neutral value standing in. A Qloo tag with no affinity SHALL NOT become a theme, SHALL NOT be searched on Tavily and SHALL NOT be suggested. When no tag Qloo named has an affinity, research SHALL stop with `QLOO_NO_MATCH` before any Tavily search. The feedback loop SHALL re-fit its weights from ideas with a Qloo affinity only.

#### Scenario: One tag without affinity

- **WHEN** Qloo names "anime" with affinity 0.9 and "cozy" with affinity 0 for a brief
- **THEN** only "anime" is searched and suggested, and its demand is 0.9

#### Scenario: No tag with affinity

- **WHEN** every tag Qloo names for a brief has affinity 0
- **THEN** research stops with `QLOO_NO_MATCH`, no Tavily search runs and no credits are spent
