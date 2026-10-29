## MODIFIED Requirements

### Requirement: Targetable audiences and real markets

The audiences SHALL leave out the families an ad may not target (communities, politics, beliefs, global issues, investing, professions), and audiences whose names are about money, jobs or politics whatever their family ("Angel Start Up Investing", "Sales Professional", "Political Junkie"). The cities SHALL be ranked by Qloo affinity x popularity within one country, the United States unless another is asked for.

#### Scenario: Sensitive audience

- **WHEN** Qloo ranks "LGBTQ (Communities)" first
- **THEN** it is not shown, and the next targetable audiences are

#### Scenario: Off-topic audience

- **WHEN** Qloo ranks "Angel Start Up Investing" for a K-drama idea
- **THEN** it is not shown

## ADDED Requirements

### Requirement: Each idea's own buyers, with a scope

An idea with a Qloo tag SHALL read its audiences, places and brands from its tag alone, so ideas of one run differ. Its age and gender SHALL come from the brief's Qloo entities and be marked as the brief's (`buyersScope: "brief"`). An idea without a tag SHALL read the brief's entities and be marked `scope: "brief"`, so the card can say "Same buyers as your brief". An answer kept before scopes existed SHALL be read again.

#### Scenario: Two ideas of one run

- **WHEN** a run has two ideas with different Qloo tags
- **THEN** their places and audiences come from their own tags, and both say their age comes from the brief
