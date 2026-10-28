# ads-and-campaigns Specification

## Purpose

Publishing approved designs as Fourthwall products and staging Meta campaigns that never spend until the designer approves them, inside their spend caps.

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

Every Meta campaign, ad set and ad SHALL be staged so that it cannot spend: in the ad account's draft, or live and PAUSED. Each SHALL target the chosen countries as a hard control, with a daily budget between $1 and $500. When the `media-buying-live` flag is on, wovain SHALL read every staged object back. If any object could spend, wovain SHALL pause the campaign and fail the staging. wovain SHALL activate spend only as described in "Activation through approvals".

#### Scenario: Budget out of range

- **WHEN** a campaign is requested with a daily budget above $500
- **THEN** the request is rejected before anything is created on Meta

#### Scenario: Campaign staged

- **WHEN** a campaign is created
- **THEN** it appears as a draft or paused in Meta Ads Manager, its status is saved, and a `campaign_created` event is captured

#### Scenario: Staging came back live

- **WHEN** the read-back finds a staged object that is not a draft and not PAUSED
- **THEN** wovain pauses the campaign and the staging fails

### Requirement: Qloo audience suggestions

When the `qloo-audiences` flag is on, the ad set SHALL also carry Qloo's ages, gender and Meta interests (audience-targeting) as Advantage+ audience suggestions, and the ad copy SHALL be written for that audience; otherwise it SHALL target the chosen countries only.

#### Scenario: Qloo targeting

- **WHEN** a campaign is created with `qloo-audiences` on for a brand with Qloo entities
- **THEN** the ad set targets the chosen countries plus Qloo's ages, gender and matched interests, and a retry of the staging sends the same targeting

### Requirement: Activation through approvals

With the `media-buying-live` and `autonomy-approvals` flags on, a request to start a staged campaign SHALL become a `media.campaign.activate` approval whose cost and spend are the daily budget. The policy SHALL deny it over a spend cap and otherwise wait for the merchant. Only an approved activation SHALL publish the campaign on Meta, after which wovain SHALL save the status it reads back and record the outcome on the approval.

#### Scenario: Merchant approves

- **WHEN** the merchant asks to start a draft campaign within their caps and approves the approval
- **THEN** wovain publishes the campaign's draft objects as active, saves Meta's status (for example `in_review`), and the approval ends `done`

#### Scenario: Over the cap

- **WHEN** the merchant asks to start a campaign whose daily budget would exceed the daily spend cap
- **THEN** the approval is `denied` with reason `over_daily_cap` and nothing is sent to Meta

#### Scenario: Event delivered twice

- **WHEN** the approved event reaches the executor a second time
- **THEN** nothing more is sent to Meta

#### Scenario: Meta refuses

- **WHEN** Meta rejects the activation
- **THEN** the approval ends `failed` with Meta's reason, the error is logged at error level, and the campaign keeps its status

### Requirement: Spend caps across campaigns

The spend caps SHALL count the daily budgets wovain has already committed: every campaign that is not draft, paused or archived, and every approved activation not yet carried out. The monthly cap SHALL count each committed daily budget, and the new one, for every day left in the month.

#### Scenario: Caps across campaigns

- **WHEN** one campaign is live or approved to start, and the merchant asks to start a second whose budget fits the daily cap alone but not with the first
- **THEN** the second approval is `denied` with reason `over_daily_cap`

#### Scenario: Monthly cap over the rest of the month

- **WHEN** on October 28 the merchant asks to start a $15-a-day campaign under a $50 monthly cap
- **THEN** the approval is `denied` with reason `over_monthly_cap`, since four days at $15 is $60

### Requirement: Durable media execution

Once Meta accepts an activation, wovain SHALL save the campaign as `publishing` at once and SHALL NOT record the approval `failed`. The executor SHALL run as separate durable steps (claim, perform, record), so a retry resumes an approval left `executing`.

#### Scenario: Read-back fails after Meta accepted

- **WHEN** Meta accepts the activation but reading the status back fails
- **THEN** the error is logged at error level, the campaign reads `publishing`, and the approval ends `done` with the result marked unverified

#### Scenario: Executor died while executing

- **WHEN** the executor's retry finds the approval it claimed still `executing`
- **THEN** it carries the action out and records the outcome

### Requirement: Pause and status sync

A merchant SHALL be able to pause any campaign that may spend (every status except draft, paused and archived, including `with_issues` and `unknown`) at once. The pause SHALL be queued and audited, approved by the merchant in the same request, and sent to Meta as a status-only update. A merchant SHALL be able to refresh a campaign's status from Meta.

#### Scenario: Pause

- **WHEN** the merchant pauses a running campaign
- **THEN** Meta receives `{status: PAUSED}`, the approval ends `done` and the campaign reads `paused`

### Requirement: Measurable delivery

With the `media-buying-live` flag on, a campaign SHALL optimize for `PURCHASE` on the pixel (`OUTCOME_SALES`) when the ad account has exactly one pixel or the caller names one, and for landing page views otherwise. Only the datasets listed in the top-level `data` of Meta's reply SHALL count as pixels. Every ad link SHALL carry `utm_source`, `utm_medium`, `utm_campaign` (the Meta campaign ID) and `utm_content` (the variant).

#### Scenario: Shop with one pixel

- **WHEN** a campaign is staged on an ad account with one pixel
- **THEN** the campaign is `OUTCOME_SALES` with a `PURCHASE` promoted object, and each link is UTM-tagged

### Requirement: Advantage+ audience

With the `media-buying-live` flag on, the ad set SHALL keep Advantage+ audience on, with the chosen countries as hard limits and the brand's ages and genders as suggestions. wovain SHALL NOT send interest IDs it has not looked up.

#### Scenario: Brand with demographics

- **WHEN** the brand profile says women aged 22 to 34
- **THEN** the ad set suggests ages 22 to 34 and women, keeps Advantage+ audience on and limits delivery to the chosen countries
