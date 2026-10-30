# app-ui Specification

## Purpose

How the signed-in app presents a drop, its run, its approvals, its connections and its results, in the visual system of `apps/web/DESIGN.md` and the voice of `.agents/product-marketing.md`.

## Requirements

### Requirement: Run status in plain words

The run view SHALL show the current step, what the run is waiting for and, when it failed, which step failed and the next action, without internal terms, vendor names or server error text.

#### Scenario: Waiting for approval

- **WHEN** a run is waiting for the designer's decision
- **THEN** the run view says so and links to the design to approve

#### Scenario: Run stopped

- **WHEN** a run failed during trend research
- **THEN** the runs list says it stopped during the trends step, with no service or variable names

### Requirement: Approval shows the math

The approval screen SHALL show the design on its blank with price, profit, margin and the judge's verdict and fixes.

#### Scenario: Design ready

- **WHEN** a design is pending approval
- **THEN** the designer sees its price breakdown and verdict before choosing approve or reject

### Requirement: Resumable new-drop flow

The new-drop flow SHALL keep its run and step in the URL, so a refresh, a run email link or the browser's back button returns to the same step.

#### Scenario: Refresh on the designs step

- **WHEN** the designer reloads the page while approving designs
- **THEN** the flow reopens the same run on the designs step

### Requirement: Merchant connections only

The connections page SHALL list only the accounts the designer connects (Fourthwall, Meta and fal), each with its official mark, and SHALL NOT name the models or services wovain runs on its own keys.

#### Scenario: fal not yet connectable

- **WHEN** the fal sign-in has not shipped
- **THEN** fal is listed as coming soon with its connect action disabled

### Requirement: Insights per drop

The Insights page SHALL show shop revenue, profit and orders from Fourthwall, ad spend, ROAS, CTR and cost per result from Meta, and design and ad scores per drop, for a 7, 28 or 90 day period; each source SHALL show its own empty, not-connected or unavailable state.

#### Scenario: Meta not connected

- **WHEN** a designer without a Meta connection opens Insights
- **THEN** the ads section explains what it would show and offers to connect Meta, while the shop and drops sections still load

### Requirement: Every state designed

Each signed-in screen SHALL have empty, loading and error states, and SHALL work at phone width in light and dark themes, with motion that respects reduced motion.

#### Scenario: No drops yet

- **WHEN** a designer with no runs opens the dashboard
- **THEN** they see the setup checklist and one action to start a drop

### Requirement: Connect states, not errors

When a screen or step can't load or finish because the merchant hasn't connected a provider, or its sign-in expired, the app SHALL show a connect state instead of an error: the provider's mark, one line on what connecting unlocks and a primary connect button that starts the Connections flow and returns to the same screen. A missing connection SHALL NOT raise an error toast or an error-level log; every other failure SHALL stay an error. fal SHALL NOT be named while wovain draws the art.

#### Scenario: Products without Fourthwall

- **WHEN** a designer without a Fourthwall connection opens Products
- **THEN** one connect state for Fourthwall replaces readiness, drops, products and orders, with no error shown

#### Scenario: Run stopped for a missing connection

- **WHEN** a run failed because Fourthwall isn't connected
- **THEN** the run view offers "Connect Fourthwall", returns to the same run after connecting and then offers "Try again" in one click

#### Scenario: Merchant with no Fourthwall shop

- **WHEN** a Fourthwall connect prompt shows (onboarding, a connect state or the Connections page)
- **THEN** it keeps "Connect Fourthwall" as the primary button and adds one line, "No Fourthwall shop yet?", with a secondary link "Create a free Fourthwall shop" to Fourthwall's sign-up in a new tab (`rel="noopener noreferrer"`) and the hint "Then come back and connect it."
- **AND** clicking the link captures `fourthwall_signup_clicked` with the surface (`onboarding`, `connect_state` or `connections`)

### Requirement: Story rail

While the `story-ui` flag is on, the app rail SHALL show four places: Home, Drops, Store and Settings. Store SHALL show only while `store-management` is on. Autopilot SHALL show only while `autopilot-triggers` is on. The pages that leave the rail (new drop, insights, connections, billing) SHALL keep their URLs. The rail SHALL mark the place a page belongs to.

#### Scenario: Billing belongs to Settings

- **WHEN** a merchant with `story-ui` on opens the billing page
- **THEN** the rail marks Settings and the breadcrumb reads Home, Settings, Billing

#### Scenario: Flag off

- **WHEN** `story-ui` is off for the merchant
- **THEN** the rail and the overview are as before

### Requirement: Story Home

While `story-ui` is on, `/dashboard` SHALL show, in this order:

1. The next action.
2. What sells now, from Qloo. One click opens a drop at its designs with that idea and its evidence.
3. The drops in progress.
4. The results of the last 28 days.

Before the first sale, the results area SHALL stay on the page. Its empty state SHALL say where the first sale will show. The Home SHALL not redirect to the onboarding steps.

#### Scenario: No sale yet

- **WHEN** a merchant has no order in the last 28 days
- **THEN** the Home shows the results area with "Your first sale shows here"

#### Scenario: A drop waits for approval

- **WHEN** the merchant's shop and Meta are set up and a drop has designs to approve
- **THEN** the next action is to approve a design and opens that drop

### Requirement: One setup source of truth

The Home's next action and the onboarding steps SHALL read the same facts: the brief, the Store's setup checklist, Meta and the spend limits, and the drop's designs and campaign. The store step SHALL count the required steps of the Store's checklist. Brand SHALL be optional and SHALL not be a setup step.

#### Scenario: Store not ready

- **WHEN** 2 of the Store checklist's 5 required steps are done
- **THEN** the next action says "2 of 5 store steps done" and opens the Store

### Requirement: Settings hub

While `story-ui` is on, Settings SHALL list connections, the optional brand, billing, and account and security, each with a link to its page.

#### Scenario: Open Settings

- **WHEN** a merchant opens Settings
- **THEN** they see the four sections, with brand marked optional

### Requirement: Internal tools out of the merchant's path

The merchant UI SHALL not show the With and Without Qloo comparison. Autopilot's page, rail item and scheduled scans SHALL follow `autopilot-triggers`, and the header mic SHALL follow `voice-input`. Both SHALL be on in development only. Scan now SHALL follow `scan-now`.

#### Scenario: Next environment

- **WHEN** a merchant uses next.wovain.com
- **THEN** there is no autopilot rail item, no header mic, no Scan now button and no With and Without Qloo panel

### Requirement: One page per drop

While `story-ui` is on, each drop SHALL have its own page at `/dashboard/drops/<id>`. The page SHALL read top to bottom in this order: why it sells, who buys and where, ideas, designs, product, campaign and results. A link to `/dashboard/new?run=<id>` SHALL redirect to the drop page. The autopilot switch SHALL not show on the drop.

#### Scenario: Old link

- **WHEN** a merchant opens a run email link to `/dashboard/new?run=<id>`
- **THEN** they land on `/dashboard/drops/<id>`

### Requirement: Drop sections say where they stand

Each working section of the drop page SHALL show one of these states: done, needs you, working, stopped or not started. The step that needs the merchant SHALL open inside its own section. A done section SHALL offer to reopen it.

#### Scenario: Ideas wait for the merchant

- **WHEN** a drop's ideas are ready and none is picked
- **THEN** the Ideas section says "Needs you" and holds the idea picker, and the later sections say "Not started"

### Requirement: Decided by Qloo

A "Decided by Qloo" mark SHALL sit beside each decision Qloo makes, and nowhere else. On the drop page, these are why the idea sells, who buys it and the campaign's targeting. Opening the mark SHALL show the decision in a sentence, then its evidence. A missing value SHALL say "Not available" with the reason, and SHALL not disappear.

#### Scenario: Evidence per decision

- **WHEN** the merchant opens the marks on a drop page
- **THEN** why it sells shows the taste affinity, this week's news, similar listings and the number of sources
- **AND** who buys shows the audiences, places and brands
- **AND** the targeting shows the Qloo audiences, the Meta interests and the ages

#### Scenario: Affinity missing

- **WHEN** Qloo returned no affinity for the lead idea
- **THEN** the mark's evidence says the affinity is not available and why

### Requirement: One fixed idea card

While `story-ui` is on, every idea SHALL show as one card, both in what sells now and in a drop's ideas. The card SHALL have the sections of the idea-card contract in a fixed order: what to make, why it sells, who buys and where, and competition. A section without data SHALL say "Not available: <reason>" and SHALL not vanish. The title SHALL be the readable title from the ranking pipeline. Without one, the card SHALL label the Qloo tag as a tag. Each card SHALL carry a Decided by Qloo mark.

#### Scenario: Who buys not read yet

- **WHEN** an idea's audience has not been read
- **THEN** its card says "Not available: not read yet" under Who buys and where and offers the read

#### Scenario: Same buyers as the brief

- **WHEN** an idea's audience is the brief's
- **THEN** its card says so once instead of repeating the brief's buyers as the idea's
