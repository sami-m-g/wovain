## MODIFIED Requirements

### Requirement: Qloo audience suggestions

Every ad set SHALL carry Qloo's ages, gender and Meta interests (audience-targeting) as Advantage+ audience suggestions, and the ad copy SHALL be written for that audience. When a targeting step failed or Qloo kept no audience for the brand, `campaigns.create` SHALL refuse with `QLOO_AUDIENCE_MISSING`, carrying the reason (`failed` or `no_audience`) and a fix, and SHALL stage nothing on Meta. A retry SHALL ask Qloo again.

#### Scenario: Qloo targeting

- **WHEN** a campaign is created for a brand with Qloo entities
- **THEN** the ad set targets the chosen countries plus Qloo's ages, gender and matched interests, and a retry of the staging sends the same targeting

#### Scenario: Qloo fails

- **WHEN** Qloo's audience scoring answers an error while a campaign is created
- **THEN** the call fails with `QLOO_AUDIENCE_MISSING` and reason `failed`, no Meta object is made, and a later retry with Qloo back stages the campaign

#### Scenario: No audience

- **WHEN** the brand has no Qloo brand entity, so Qloo keeps no audience
- **THEN** the call fails with `QLOO_AUDIENCE_MISSING`, reason `no_audience` and a fix that asks for a brand Qloo knows
