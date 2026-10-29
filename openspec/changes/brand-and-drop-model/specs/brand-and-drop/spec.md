## ADDED Requirements

### Requirement: The brand is the defaults a drop needs

A merchant's brand SHALL hold their niche and audience (Qloo entities, tags and demographics), taste references, voice, palette, preferred blanks, and price floor and margin, and nothing more.

#### Scenario: Brand from onboarding

- **WHEN** a merchant finishes the brand step of onboarding
- **THEN** their brand holds the niche and audience, references, voice, palette, preferred blanks, and price floor and margin they chose or accepted

### Requirement: A drop starts manual or suggested

A merchant SHALL be able to start a drop manually, by giving the direction in their own words, or from a direction wovain suggests from the brand plus current trends from Qloo and Tavily.

#### Scenario: Manual drop

- **WHEN** a merchant types "90s rave flyers" as the direction for a drop
- **THEN** wovain researches that direction with Qloo and Tavily and the drop follows it

#### Scenario: Suggested drop

- **WHEN** a merchant asks wovain to suggest a drop
- **THEN** wovain proposes directions from the brand's niche, audience and references and current Qloo and Tavily trends, and the merchant picks one

### Requirement: Drop fields start from the brand

When a drop is created, it SHALL take the brand's niche and audience, references, voice, palette, preferred blanks, and price floor and margin as its starting values.

#### Scenario: New drop

- **WHEN** a merchant creates a drop without changing anything
- **THEN** the drop uses the brand's voice, palette, preferred blanks and price floor

### Requirement: Any field can be overridden per drop

The merchant SHALL be able to override any of the drop's fields on that drop only, without changing the brand. A drop's price floor SHALL never be under the global cost-plus floor.

#### Scenario: Override the palette

- **WHEN** a merchant changes a drop's palette
- **THEN** that drop uses the new palette and the brand palette is unchanged

#### Scenario: Price floor under the global floor

- **WHEN** a merchant sets a drop's price floor under the global cost-plus floor
- **THEN** the drop's price floor is raised to the global floor
