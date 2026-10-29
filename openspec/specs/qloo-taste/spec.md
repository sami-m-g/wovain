# qloo-taste Specification

## Purpose

How Qloo's taste graph shapes the ideas a run researches, how each idea explains what Qloo contributed, and how the difference Qloo makes is measured.

## Requirements

### Requirement: Qloo in every run

Research SHALL call Qloo in every run, whatever the merchant's plan, and a merchant SHALL have no choice to run without it. `trends-qloo` SHALL be an ops kill switch only, with no plan limit: while it is off, `runs.start` (before saving a run) and research SHALL refuse with `QLOO_OFF`. Flags SHALL be evaluated with the merchant's real plan. A failed Qloo call SHALL fail the research step and be logged at error level.

#### Scenario: Paid plan

- **WHEN** a merchant on a paid plan starts a run
- **THEN** research calls Qloo, and the flag evaluations carry the merchant's paid plan

#### Scenario: Paid plan with the taste map on

- **WHEN** a merchant on a paid plan starts a run while `qloo-taste-map` is on
- **THEN** research calls Qloo and the ideas carry Qloo's taste map

#### Scenario: Kill switch off

- **WHEN** a merchant starts a run while `trends-qloo` is off
- **THEN** `runs.start` answers `QLOO_OFF`, and no run is saved or queued

#### Scenario: Qloo fails

- **WHEN** Qloo answers with an error during research
- **THEN** the research step fails, the run fails after its retries, the error is logged at error level, and no idea is saved

### Requirement: Cross-domain affinities in the brief

Research SHALL ask Qloo, with explainability and a trend bias, which brands, artists and films the seed's fans also like. Each affinity SHALL keep its Qloo affinity and the share each matched seed entity contributed. The design brief SHALL receive the affinities' aesthetic cues, and SHALL NOT receive their names.

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

No product path SHALL run without Qloo. An offline eval SHALL research the same seeds with Qloo's themes and with themes a model splits from the brief alone (an eval-only arm), and SHALL report, for each arm, the share of themes grounded in a Qloo tag, the share of ideas explained by Qloo entities, the number of aesthetic cues, and how far the themes move from the seed's own words. Its report SHALL be committed, and SHALL record for each seed the cross-domain calls Qloo refused.

#### Scenario: Qloo fails during the eval

- **WHEN** the Qloo search or theme call fails for a seed during the eval
- **THEN** the eval fails instead of reporting a with-Qloo arm without themes

#### Scenario: Qloo refuses a domain's affinities

- **WHEN** a brand, film or TV affinity call fails for a seed, as when Qloo refuses the seed's entities as signals
- **THEN** the seed's report lists that domain under `failedDomains`, the seed has no affinities from it, and the eval goes on

#### Scenario: Eval without keys

- **WHEN** the eval runs without `QLOO_API_KEY` or `NEBIUS_API_KEY`
- **THEN** the suite is skipped

### Requirement: Without Qloo beside the ideas

The ideas step SHALL show, under the ideas, a greyed "Without Qloo" panel read from the committed ablation report: for the with-Qloo and the model-only arm, the share of themes grounded in a Qloo tag, the share Qloo explains, the taste domains and the style cues, and each seed's themes side by side, with the run's date and model. The panel SHALL make no call.

#### Scenario: Ideas are ready

- **WHEN** the ideas step shows a run's ideas
- **THEN** the "Without Qloo" panel shows both arms' figures from the committed report, and the seeds' themes on request

#### Scenario: Qloo found no taste for a seed

- **WHEN** a seed's with-Qloo themes are empty in the report
- **THEN** its row says no taste was found instead of an empty cell
