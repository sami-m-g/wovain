# Spec Delta

## ADDED Requirements

### Requirement: Onboarding wizard

While the `onboarding-wizard` flag is on, the system SHALL offer a signed-in designer one wizard with these steps in order: connect Fourthwall and Meta, brand identity, autonomy level and spend caps, done. Each step SHALL be skippable and SHALL show what was saved when the designer comes back. With the flag off, the wizard's procedures SHALL answer 404 and the wizard SHALL NOT be linked.

#### Scenario: First visit

- **WHEN** a designer with no connections and no brand profile opens the wizard
- **THEN** the first step shows Fourthwall and Meta as missing, each with one connect button

#### Scenario: Flag off

- **WHEN** the flag is off for the designer
- **THEN** `onboarding.saveBrand` and `onboarding.resolveReferences` answer 404 and `onboarding.status` reports the wizard as off

### Requirement: Taste references resolved with Qloo

The system SHALL accept 3 to 5 taste references and resolve each with Qloo `/search` across artists, brands, films, TV shows, books, podcasts, games and people. A reference Qloo doesn't match SHALL fall back to cultural proxies: a Tavily search, Nemotron naming concrete entities from the results, and each one resolved in Qloo. Entity IDs SHALL only come from Qloo.

#### Scenario: Known reference

- **WHEN** the designer enters "Wes Anderson"
- **THEN** the answer lists the Qloo entity with its ID, name and type, marked as found directly

#### Scenario: Unknown reference

- **WHEN** Qloo finds nothing for a small label's name and the web search names two of its collaborators that Qloo knows
- **THEN** the answer lists those two Qloo entities, each marked as a proxy of the reference, with the web sources

#### Scenario: Nothing found

- **WHEN** neither Qloo nor the proxies resolve a reference
- **THEN** the reference is reported as unresolved with no entity

### Requirement: Reference failures stay separate

Each Qloo, Tavily or Nemotron failure while resolving a reference SHALL be logged at error level and SHALL mark only that reference as failed; the other references SHALL still resolve.

#### Scenario: Qloo rate limit on one reference

- **WHEN** Qloo answers 429 for one of four references
- **THEN** that reference reads unresolved and failed, the error is logged, and the other three resolve

### Requirement: Brand profile saved to memory

Saving the brand step SHALL upsert the designer's `brand_profile` (references, Qloo entities, voice, palette, niches) and SHALL write the Voice, Palette and typography, and Niches lines of the designer's taste memory, keeping the approved and rejected designs already there.

#### Scenario: Save the brand

- **WHEN** the designer saves the voice "dry, lowercase", the palette "#1A1A1A" and the niche "y2k racing"
- **THEN** `brand_profile` holds them and the taste memory reads `- Voice: dry, lowercase`, `- Palette and typography: #1A1A1A` and `- Niches: y2k racing`

### Requirement: Connection health

The system SHALL report, for each provider a drop needs, whether it is connected, expired or missing, what it is needed for, and whether a drop can start. fal SHALL NOT be listed while wovain draws on its own key.

#### Scenario: Expired Meta grant

- **WHEN** the Meta grant needs reconnecting
- **THEN** Meta reads expired with a reconnect button, and a drop can still start because Meta is needed only to stage ads
