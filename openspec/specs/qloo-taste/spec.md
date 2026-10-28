# qloo-taste Specification

## Purpose

How Qloo's taste graph shapes the ideas a run researches, how each idea explains what Qloo contributed, and how the difference Qloo makes is measured.

## Requirements

### Requirement: Qloo in every run

While the `qloo-taste-map` flag is on, research SHALL call Qloo in every run, whatever the merchant's plan, unless the `trends-qloo` kill switch is off or the merchant turned Qloo off for that run. A Qloo failure SHALL be logged at error level, SHALL NOT fail the run, and SHALL be recorded on each idea of the run.

#### Scenario: Paid plan with the flag on

- **WHEN** a merchant on a paid plan starts a run while `qloo-taste-map` is on
- **THEN** research calls Qloo and the ideas carry Qloo's taste map

#### Scenario: Qloo fails

- **WHEN** Qloo answers with an error during research
- **THEN** the error is logged at error level, research goes on with themes from the brief, and each idea's taste map has status `failed`

### Requirement: Cross-domain affinities in the brief

Research SHALL ask Qloo, with explainability and a trend bias, which brands, artists and films the seed's fans also like. Each affinity SHALL keep its Qloo affinity and the share each matched seed entity contributed. The design brief SHALL receive the affinities' aesthetic cues, and SHALL NOT receive their names.

#### Scenario: Brief from a Qloo-backed idea

- **WHEN** a brief is drafted for an idea whose taste map has cross-domain affinities
- **THEN** the brief's input holds their aesthetic cues and no affinity name

### Requirement: Why this idea

Each idea card SHALL show a "Why this idea" panel with the seed entities Qloo matched, the theme's Qloo tag and affinity, and the cross-domain affinities with their contributing entities. When Qloo failed, found no match or was off for the run, the panel SHALL say which, instead of showing a taste map.

#### Scenario: Idea from Qloo

- **WHEN** a designer views an idea whose theme came from a Qloo tag
- **THEN** the panel shows the tag, its affinity, the seed entities and the cross-domain affinities

#### Scenario: Run without Qloo

- **WHEN** a designer views an idea from a run started with Qloo off
- **THEN** the panel says the run used LLM-only themes

### Requirement: With-Qloo and LLM-only comparison

A merchant SHALL be able to start a run with Qloo off while `qloo-taste-map` is on. An offline eval SHALL research the same seeds with Qloo and without it and SHALL report, for each arm, the share of themes grounded in a Qloo tag, the share of ideas explained by Qloo entities, the number of aesthetic cues, and how far the themes move from the seed's own words.

#### Scenario: Eval without keys

- **WHEN** the eval runs without `QLOO_API_KEY` or `NEBIUS_API_KEY`
- **THEN** the suite is skipped
