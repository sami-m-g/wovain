# meta-setup Specification

## Purpose

TBD - created by archiving change meta-setup-cards. Update Purpose after archive.

## Requirements

### Requirement: Meta setup cards

The system SHALL read the merchant's ad account, Pages and Instagram accounts through the Meta Ads MCP and show a card for each of `ad_account`, `payment`, `page`, `instagram` (optional) and `safety_rules`. A step only the account owner can take SHALL link to the exact Meta screen in a new tab, and the page SHALL poll so the card ticks off once Meta reports it done.

#### Scenario: No payment method

- **WHEN** the ad account is active and `has_payment_method` is false
- **THEN** the payment card is to do and links to the billing hub payment settings for that ad account

#### Scenario: No Page

- **WHEN** the ad account has no Page
- **THEN** the Page card links to the business settings Pages screen and offers Page creation

#### Scenario: Held account

- **WHEN** Meta reports the ad account disabled or in review
- **THEN** the ad account card waits on Meta and links to account quality

### Requirement: Safety rules readiness

With the merchant's single Meta grant, the system SHALL read the granted Graph permissions and whether the ad account's automated rules can be read. Both `ads_management` and `business_management` granted, with the rules readable, SHALL mark the card done and record `meta_graph_ready`; a refused token or a missing permission SHALL ask the merchant to reconnect Meta, and the failure SHALL be logged at error level.

#### Scenario: Permission declined

- **WHEN** Graph answers `business_management` declined
- **THEN** the safety rules card asks to reconnect Meta

#### Scenario: Token refused

- **WHEN** Graph answers error 190 for the grant
- **THEN** the safety rules card asks to reconnect Meta
