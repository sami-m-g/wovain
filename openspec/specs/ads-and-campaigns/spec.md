# ads-and-campaigns Specification

## Purpose

Publishing approved designs as Fourthwall products and staging Meta campaigns that never spend until the designer turns them on.

## Requirements

### Requirement: Hidden products

An approved design SHALL become a Fourthwall product created hidden on the designer's shop, and SHALL become public only through a separate publish step.

#### Scenario: Publish

- **WHEN** the designer publishes a hidden product
- **THEN** the product becomes public and a `product_published` event is captured

### Requirement: Ad variants

The system SHALL write up to three ad variants per product, each with an angle, headline and message.

#### Scenario: Copy generated

- **WHEN** a campaign is created for a product
- **THEN** between one and three variants are written and stored with the campaign

### Requirement: Paused campaigns

Every Meta campaign, ad set and ad SHALL be created paused, with a daily budget between $1 and $500; wovain SHALL never activate spend. The ad set SHALL target the chosen countries as a hard control. When the `qloo-audiences` flag is on, it SHALL also carry Qloo's ages, gender and Meta interests (audience-targeting) as Advantage+ audience suggestions, and the ad copy SHALL be written for that audience; otherwise it SHALL target the chosen countries only.

#### Scenario: Budget out of range

- **WHEN** a campaign is requested with a daily budget above $500
- **THEN** the request is rejected before anything is created on Meta

#### Scenario: Campaign staged

- **WHEN** a campaign is created
- **THEN** it appears paused in Meta Ads Manager and a `campaign_created` event is captured

#### Scenario: Qloo targeting

- **WHEN** a campaign is created with `qloo-audiences` on for a brand with Qloo entities
- **THEN** the ad set targets the chosen countries plus Qloo's ages, gender and matched interests, and a retry of the staging sends the same targeting
