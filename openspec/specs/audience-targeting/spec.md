# audience-targeting Specification

## Purpose

Turning Qloo's demographics and audiences for a merchant's brand into Meta ad set targeting (ages, gender, interests), with the evidence behind every choice.

## Requirements

### Requirement: Qloo demographics set Meta ages and gender

The system SHALL map Qloo's `urn:demographics` age buckets for the brand's Qloo entities to Meta `age_min` and `age_max`, using the run of positive buckets around the highest one. It SHALL set Meta `genders` only when one gender's affinity leads the other's by at least 0.3. Under Advantage+ audience, `age_min` SHALL be capped at 25 and Qloo's own range SHALL be kept in the evidence. The merchant's own ages and genders in the brand profile SHALL win over Qloo's.

#### Scenario: Qloo leans young and male

- **WHEN** Qloo's mean affinity is positive for 25-29 and 30-34 only, and men lead women by 0.62
- **THEN** the ad set targets ages 25 to 34 and `genders` [1]

#### Scenario: No lean

- **WHEN** no age bucket is positive and neither gender leads by 0.3
- **THEN** the ad set sets no ages and no genders

#### Scenario: Merchant override

- **WHEN** the brand profile says ages 21 to 40 and women
- **THEN** the ad set targets ages 21 to 40 and `genders` [2], and Qloo's demographics are not asked for

### Requirement: Qloo audiences scored against the brand

The system SHALL score each Qloo audience in its catalog against the brand's Qloo brand entities and keep up to three audiences whose mean affinity is at least 0.02 above the average across audiences. The catalog SHALL leave out communities, global issues, politics, beliefs, investing and professions.

#### Scenario: Flat answer

- **WHEN** Qloo gives every audience the same affinity
- **THEN** no audience is kept

### Requirement: Meta interests only from Meta's search

Interest IDs SHALL come only from Meta's targeting search. An interest SHALL be used only when Meta names it like the query: the exact name, or whole words contained either way. Each match SHALL be kept as evidence with the Qloo ID it came from, the query, the Meta ID, name, path and audience size. Queries with no match SHALL be kept as unmatched.

#### Scenario: No match

- **WHEN** Meta's search answers no interest named like "Supreme"
- **THEN** no interest is added for it and the query is listed as unmatched

### Requirement: Failed steps are visible and left out

A step that fails (Qloo demographics, Qloo audiences or Meta interests) SHALL be logged at error level, marked failed in the decision trace and in the evidence, and left out of the targeting. The targeting SHALL never contain a guessed value.

#### Scenario: Meta search fails

- **WHEN** Meta's interest search answers an error
- **THEN** the ad set keeps Qloo's ages and gender, has no interests, and the failure reaches error tracking

### Requirement: Targeting preview

`targeting.preview({ countries })` SHALL return the Meta targeting, the persona and the evidence for the signed-in merchant's brand, behind the `qloo-audiences` flag, and SHALL save its steps as a decision trace.

#### Scenario: Flag off

- **WHEN** the `qloo-audiences` flag is off for the merchant
- **THEN** the preview answers 404
