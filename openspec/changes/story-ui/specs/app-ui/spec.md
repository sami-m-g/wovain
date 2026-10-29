# Spec Delta

## ADDED Requirements

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
2. What sells now, from Qloo. One click opens a new drop with that brief.
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
