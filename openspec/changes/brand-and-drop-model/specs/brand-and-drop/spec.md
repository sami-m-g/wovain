## ADDED Requirements

### Requirement: The Brand owns the lasting identity

A Brand SHALL hold a name and logo, a niche and a core Qloo audience (Qloo entities, tags and demographics), long-term taste references, a voice made of a personality and a list of hard guardrails, a default palette with one or two anchor colours and an optional "Always use my brand colours" lock, preferred blanks, and a price floor and margin.

#### Scenario: First brand from onboarding

- **WHEN** a merchant finishes the brand step of onboarding
- **THEN** their answers are saved as their first Brand, with its core Qloo audience from the resolved taste references

#### Scenario: Guardrails kept apart from the personality

- **WHEN** a merchant's voice is "playful, dry humour" with the guardrail "never crude"
- **THEN** the Brand stores "playful, dry humour" as the personality and "never crude" as a guardrail

### Requirement: Several brands per merchant

A merchant SHALL be able to own more than one Brand, and each drop SHALL belong to exactly one Brand.

#### Scenario: Second brand

- **WHEN** a merchant with one Brand starts a new brand
- **THEN** they own two Brands, and each new drop asks which Brand it belongs to

### Requirement: What a drop may override

A Drop SHALL inherit every field of its Brand and SHALL be able to override only its tone, its palette, its audience slice and its products. The name, logo, guardrails, price floor and margin SHALL never be overridden by a drop. The tone SHALL never break a guardrail.

#### Scenario: Drop tries to rename the brand

- **WHEN** a drop's brief carries a different brand name
- **THEN** the drop keeps the Brand's name

### Requirement: Drop palette starts from the anchor colours

A regular drop's palette SHALL keep at least one of the Brand's anchor colours. While the Brand's palette lock is on, a regular drop SHALL use the Brand palette unchanged.

#### Scenario: Palette without an anchor colour

- **WHEN** a regular drop's palette contains none of the Brand's anchor colours
- **THEN** the palette is refused with a message naming the anchor colours

#### Scenario: Palette lock on

- **WHEN** the lock is on and a regular drop is created
- **THEN** the drop uses the Brand palette and no other palette is offered

### Requirement: Capsule size and price floor

A drop SHALL have 4 to 6 products before it is published, and each product's price SHALL be at or above the Brand's price floor.

#### Scenario: Price under the floor

- **WHEN** a drop product would be priced under the Brand's price floor
- **THEN** the price is raised to the floor, or the product is refused if the merchant set the price by hand

#### Scenario: Capsule size

- **WHEN** a merchant tries to publish a drop with 3 products
- **THEN** the publish is refused until the drop has 4 to 6 products

### Requirement: Experimental drops

A merchant SHALL be able to mark a drop Experimental ("Try something new"). An Experimental drop SHALL be allowed to leave the Brand palette and to target an audience outside the Brand's core audience, and SHALL still keep the guardrails, the name and the price floor. Autopilot SHALL never start an Experimental drop while the palette lock is on.

#### Scenario: Experimental palette

- **WHEN** a merchant marks a drop Experimental and picks a palette with no anchor colour
- **THEN** the palette is accepted and the drop is tagged experimental

### Requirement: Insights compare Experimental drops

Experimental drops SHALL be tagged, and Insights SHALL report each one's revenue per drop and sell-through beside the Brand's regular-drop average.

#### Scenario: Insights comparison

- **WHEN** a Brand has regular and Experimental drops with sales
- **THEN** Insights shows the Experimental drops next to the regular drops' average

### Requirement: Audience overlap with the brand

The system SHALL score how much a drop's audience slice overlaps the Brand's core Qloo audience, from 0 to 1. Any drop SHALL be allowed at or above the overlap threshold (configuration, starting at 0.3). Below it, only an Experimental drop or a collab drop SHALL be allowed.

#### Scenario: Regular drop with a far audience

- **WHEN** a merchant saves a regular drop whose audience overlap is 0.1
- **THEN** the save is refused with "This audience is far from your brand's buyers"

#### Scenario: Run it as an experiment

- **WHEN** the merchant picks "run it as an experiment" for that drop
- **THEN** the drop is saved as Experimental with the far audience

### Requirement: New brand for a far audience

Before a drop below the overlap threshold is saved, the merchant SHALL be offered to start a new brand for that audience. When two or more Experimental drops for the same outside audience outsell the Brand's regular drops, the system SHALL suggest a new brand for that audience and SHALL NOT move the Brand's core audience on its own.

#### Scenario: Outside audience keeps winning

- **WHEN** two Experimental drops for the same outside audience both outsell the Brand's regular drops
- **THEN** a suggestion to start a new brand for that audience appears, and the Brand's core audience is unchanged

### Requirement: Evidence for a brand update

The system SHALL compare drops with the Brand's regular drops on revenue per drop, sell-through and ad CTR. It SHALL propose a brand update only from at least 2 drops and 30 orders (configuration), at most once a month per field, and each proposal SHALL carry its evidence. The system SHALL also offer a brand review once a year.

#### Scenario: Too little evidence

- **WHEN** an Experimental drop outsold the Brand palette over 12 orders
- **THEN** no brand update is proposed

### Requirement: What a brand update may change

A brand update SHALL be able to change the default palette, the default tone, the taste references, the preferred blanks and the core audience's slices. It SHALL NOT change the guardrails, the name, the logo or the price floor. Each brand update SHALL go through the `brand.profile.update` action, so the autonomy level decides whether it waits for approval.

#### Scenario: Proposal under draft

- **WHEN** a merchant on `draft` has an Experimental palette that outsold the Brand palette over 3 drops and 41 orders
- **THEN** a pending `brand.profile.update` approval appears with that evidence, and the Brand is unchanged until the merchant approves it

#### Scenario: Applied on autopilot, then undone

- **WHEN** a merchant on `publish_ads_paused` with the `autopilot` flag on gets the same evidence
- **THEN** the Brand palette is updated, the update is in the decision trace with its evidence, and the merchant can undo it to the previous palette
