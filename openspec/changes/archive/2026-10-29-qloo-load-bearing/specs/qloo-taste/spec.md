# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Qloo in every run

Research SHALL call Qloo in every run, whatever the merchant's plan. There SHALL be no merchant choice to run without Qloo: `runs.start` SHALL take no Qloo input and a run SHALL store none. `trends-qloo` SHALL be an ops kill switch only, with no plan limit: while it is off, `runs.start` SHALL refuse before saving a run, and research SHALL refuse, with the typed error `QLOO_OFF`. Every flag SHALL be evaluated with the merchant's real plan. A failed Qloo call SHALL fail the research step and be logged at error level.

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

## REMOVED Requirements

### Requirement: Why this idea

**Reason**: It described a panel for runs where Qloo failed, matched nothing or was off. Those runs no longer produce ideas.

**Migration**: "Qloo's taste map on each idea" replaces it. Older ideas without a matched entity show no panel.

### Requirement: With-Qloo and LLM-only comparison

**Reason**: Merchants could start an LLM-only run, and a retry kept that choice, so the product worked without Qloo.

**Migration**: The `qloo` input of `runs.start` and the `run.qloo` column are removed. The comparison stays as the offline eval ("Offline Qloo ablation").
