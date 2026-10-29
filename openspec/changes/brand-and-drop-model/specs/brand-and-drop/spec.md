## ADDED Requirements

### Requirement: Just sell by default

A merchant without a brand SHALL get drop suggestions for what will sell now, from Qloo trends, Tavily evidence and the competition read, in any niche, ranked for expected sales. Suggestions SHALL be allowed to change niche from one drop to the next.

#### Scenario: No brand

- **WHEN** a merchant with no brand asks for a drop
- **THEN** wovain suggests directions from current trends in any niche, best expected sales first

#### Scenario: Different every time

- **WHEN** a merchant with no brand asks for a second drop after a gothic one
- **THEN** the suggestions may be in a different niche

### Requirement: Nothing requires a brand

Onboarding, drops, autopilot and ads SHALL work for a merchant who has not set a brand. The onboarding brand step SHALL be skippable.

#### Scenario: Skip the brand step

- **WHEN** a merchant skips the brand step in onboarding
- **THEN** onboarding finishes and they can start a suggested drop

#### Scenario: Autopilot without a brand

- **WHEN** a merchant with no brand has autopilot on
- **THEN** autopilot still proposes drops from current trends

### Requirement: The brand is optional

A merchant SHALL be able to set a brand with a niche, audience (Qloo entities, tags and demographics), references, voice, palette and preferred blanks. With a brand set, drop suggestions SHALL stay within its niche and audience, and each drop's fields SHALL start from the brand's values.

#### Scenario: Suggestions within the brand

- **WHEN** a merchant whose brand niche is "cottagecore" asks for a drop
- **THEN** every suggested direction is within cottagecore and its audience

#### Scenario: Drop starts from the brand

- **WHEN** a merchant with a brand creates a drop without changing anything
- **THEN** the drop uses the brand's voice, palette and preferred blanks

### Requirement: A drop is suggested or manual

A drop SHALL start from a direction wovain suggests, by default, or from a direction the merchant gives in their own words.

#### Scenario: Manual drop

- **WHEN** a merchant types "90s rave flyers" as the direction for a drop
- **THEN** wovain researches that direction with Qloo and Tavily and the drop follows it

### Requirement: Any field can be overridden per drop

The merchant SHALL be able to override any of a drop's fields (niche, audience, references, voice, palette, blanks) on that drop only. Overriding a field SHALL NOT change the brand.

#### Scenario: Override the palette

- **WHEN** a merchant with a brand changes a drop's palette
- **THEN** that drop uses the new palette and the brand palette is unchanged
