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

### Requirement: Spend rules before activation

Both when the merchant asks to start a campaign and before it publishes an approved activation, wovain SHALL check that the `ads-profit-rules` and `meta-backstop-rules` flags are on and that Meta holds every backstop rule of the campaign after a sync. Otherwise it SHALL refuse to activate.

#### Scenario: Spend rules missing

- **WHEN** the merchant asks to start a campaign while the spend rules or the backstop flag is off, or Meta doesn't hold the campaign's backstop rules
- **THEN** wovain refuses the request with a precondition error and nothing is activated on Meta

#### Scenario: Rules gone after approval

- **WHEN** an approved activation reaches the executor and the spend rules are no longer in place
- **THEN** the approval ends `failed`, the error is logged at error level, and nothing is activated on Meta

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

### Requirement: A drop launches as a multi-design test

A drop of 2 to 5 live designs SHALL be staged as one paused campaign on Meta's campaign budget, with one ad set per design and one ad per copy variant. Each ad set SHALL carry `daily_min_spend_target` equal to half the daily budget split evenly across the designs. More than 5 designs SHALL be split into tests of at most 5. A single design SHALL stay a plain campaign under the key a product's campaign always had. A retry SHALL make no Meta object twice.

#### Scenario: Three designs

- **WHEN** a drop with three live designs launches at $30 a day
- **THEN** Meta gets one campaign with a $30 daily budget, three ad sets each with a $5 minimum daily spend, and an ad per copy variant in each

#### Scenario: Retried launch

- **WHEN** the same drop's test is asked for again
- **THEN** the saved campaign is returned and no Meta call is made

### Requirement: Design results and rule status

For a test campaign, the system SHALL report each design's spend, CTR, add-to-carts, sales and profit (sales times the profit per sale, minus spend) and its rule status: `testing` while any of its ads runs, `paused` with the rule's reason once all its ads are off, or `winner` for the most profitable design with a sale. The kill rules SHALL judge each ad on its own design's profit per sale.

#### Scenario: A winner

- **WHEN** one design has a sale and the highest profit, and the others have none
- **THEN** that design is the winner and the others are testing

#### Scenario: A cheap design burns its profit

- **WHEN** a design's ad spends more than its own product's profit per sale with no sale, while another design's product earns more per sale
- **THEN** only the cheap design's ad is paused

### Requirement: A test favours winning angles

While the `feedback-loop` flag is on, a drop's test SHALL split its spend floor (half the daily budget) as follows. Half SHALL be split evenly across the designs. The other half SHALL be split in proportion to each design's outcome multiplier. The shares SHALL sum to the floor. Without a track record, or when the multipliers can't be read, the split SHALL be even.

#### Scenario: One design's angles sold before

- **WHEN** a $30 test has three designs, and the first has twice the multiplier of the others
- **THEN** the first ad set's minimum daily spend is higher than the others', every ad set keeps at least $2.50, and the three add up to at most $15

### Requirement: Kill rules on the real cost per sale

While the `feedback-loop` flag is on and the merchant's ads have made at least `realCpaMinPurchases` purchases (10 by default, a setting the merchant can override), the target cost per sale SHALL be the lower of two values. One is the profit per sale. The other is the real cost per sale: total ad spend plus 3 purchases at the profit per sale, divided by total purchases plus 3. The target SHALL never be above the profit per sale. A kill's reason SHALL say when it used the real cost per sale.

#### Scenario: Sales cost less than they earn

- **WHEN** a merchant's 12 purchases cost $60 in ads and a sale earns $10
- **THEN** the target cost per sale is $6, and an ad that spends $7 with no sale and no add-to-cart is paused

#### Scenario: Too few purchases

- **WHEN** the merchant's ads have made 9 purchases
- **THEN** the target cost per sale is the profit per sale

### Requirement: The drop's Campaign step

After its products are live, a drop SHALL continue to a Campaign step showing the ad creatives, the copy once written, Qloo's audience, the budget and the spend rules, with one Launch campaign action. Its confirm SHALL be the designer's approval to activate, inside their caps. Without Meta, the step SHALL show the creatives and how to connect Meta, and SHALL NOT launch.

#### Scenario: Last product published

- **WHEN** the designer publishes the drop's last hidden product
- **THEN** the drop opens its Campaign step with the products' creatives

#### Scenario: Launch with live media buying

- **WHEN** the designer confirms Launch campaign with Meta connected and live media buying on
- **THEN** the paused campaign is staged if needed, asked to go live and approved in their name, and the drop moves to done

#### Scenario: Meta not connected

- **WHEN** the Campaign step opens without a Meta connection
- **THEN** it shows the creatives and Connect Meta to launch, and Launch campaign is disabled
