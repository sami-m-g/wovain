# competitive-landscape Specification

## Purpose

How crowded each Qloo theme already is on the print-on-demand marketplaces, how competitors sell it and what the audience likes that they miss, read with Tavily and used by the design brief, the ad writer and autopilot.

## Requirements

### Requirement: Competition read per theme

While the `tavily-competition` flag is on, a run's research step SHALL read each idea's competition before an idea is picked and save it on the idea. The read SHALL search the print-on-demand marketplaces with Tavily, count the near-identical listings among the results (on a marketplace, relevance score of at least 0.5, every theme word in the title or snippet), set a saturation level (low under 4, medium 4 to 7, high 8 or more) and cite a sample of the listings.

#### Scenario: Crowded theme

- **WHEN** 9 of the 20 marketplace results are near-identical listings of the theme
- **THEN** the idea is saved with saturation high, marked saturated, with the listings cited

#### Scenario: Flag off

- **WHEN** the `tavily-competition` flag is off
- **THEN** no competition is read and the idea card shows no Competition panel

### Requirement: How competitors sell

The read SHALL extract the top listings with Tavily Extract, read their prices with `competitorPrices`, and have a Nemotron summarizer on the model router's default job list titles, hooks, claims, prices, looks and review complaints as schema-checked points, each with the page it came from. A point that cites a page the read did not include SHALL be dropped.

#### Scenario: Invented source

- **WHEN** the summarizer cites a URL that was not among the pages read
- **THEN** that point is not saved and the decision trace records how many were dropped

### Requirement: Audience gaps

The read SHALL list as gaps the theme's Qloo affinity cues that no listing's text mentions, strongest affinity first.

#### Scenario: Uncovered cue

- **WHEN** the audience likes "neon noir" and no listing mentions it
- **THEN** "neon noir" is a gap on the idea

### Requirement: Agents use the competition

The design brief SHALL receive the looks near-identical listings use, to avoid, and the gaps, to aim at. The ad writer SHALL receive the competitor angles with their pages and write counter-positioned copy; the grounding guard SHALL accept a number or claim that appears in those lines and still reject any other.

#### Scenario: Fact from a cited line

- **WHEN** ad copy states a number that appears in a cited competitor line
- **THEN** the grounding guard accepts it, and a number in no line is still sent back

### Requirement: Autopilot skips saturated themes

An autopilot run SHALL not pick or draw a saturated idea, and SHALL save the reason on the idea's competition.

#### Scenario: Every theme saturated

- **WHEN** every idea of an autopilot run is saturated
- **THEN** no design is drawn and each idea stores why it was skipped

### Requirement: Failures are visible

A failed competition search SHALL mark the idea "competition unknown" with the reason, and the merchant MAY check again from the idea card. A failed extract, price read or summary SHALL keep the read and name the failed step. Every failure SHALL be logged at error level, and each step SHALL be recorded in the run's decision trace.

#### Scenario: Tavily down

- **WHEN** the marketplace search fails
- **THEN** the idea shows "competition unknown" with a "check again" button and the failure reaches error tracking

### Requirement: Competition in the ad approval view

The campaign card SHALL show the competition its ads were written against, with the sources.

#### Scenario: Reviewing ads

- **WHEN** the merchant opens a staged campaign whose idea had a competition read
- **THEN** the Competition panel lists the angles and gaps with their pages
