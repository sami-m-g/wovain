# Spec Delta

## MODIFIED Requirements

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
