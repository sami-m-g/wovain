## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Qloo affinity required to suggest

An idea's demand SHALL be Qloo's affinity of its theme with the seed's fans, with no neutral value standing in. A Qloo tag with no affinity SHALL NOT become a theme, SHALL NOT be searched on Tavily and SHALL NOT be suggested. When no tag Qloo named has an affinity, research SHALL stop with `QLOO_NO_MATCH` before any Tavily search. The feedback loop SHALL re-fit its weights from ideas with a Qloo affinity only.

#### Scenario: One tag without affinity

- **WHEN** Qloo names "anime" with affinity 0.9 and "cozy" with affinity 0 for a brief
- **THEN** only "anime" is searched and suggested, and its demand is 0.9

#### Scenario: No tag with affinity

- **WHEN** every tag Qloo names for a brief has affinity 0
- **THEN** research stops with `QLOO_NO_MATCH`, no Tavily search runs and no credits are spent
