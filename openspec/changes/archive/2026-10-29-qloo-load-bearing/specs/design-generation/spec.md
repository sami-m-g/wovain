# Spec Delta

## ADDED Requirements

### Requirement: Research themes are Qloo tags

Research SHALL study up to 3 distinct themes for a direction, each one a Qloo taste tag for the direction's matched entities, in Qloo's order. Research SHALL NOT make up themes from the direction, by a model or by design angles, and Tavily SHALL NOT name themes: when Qloo names fewer than 3 usable tags, research studies only those. A theme SHALL never be the direction itself, and reworded duplicates SHALL be dropped.

#### Scenario: Qloo names one theme

- **WHEN** Qloo names one usable tag for a direction
- **THEN** research saves at most one idea, titled with that tag

#### Scenario: Qloo's tag echoes the direction

- **WHEN** Qloo's only tag is the direction's own text
- **THEN** research stops with `QLOO_NO_MATCH` and searches nothing

## REMOVED Requirements

### Requirement: Distinct research themes

**Reason**: It topped Qloo's themes up from the direction (a model, then design angles), so a run worked the same without Qloo. Every theme is now a Qloo tag.

**Migration**: None for merchants. Research studies only Qloo's tags ("Research themes are Qloo tags"); no match stops the run with `QLOO_NO_MATCH`.
