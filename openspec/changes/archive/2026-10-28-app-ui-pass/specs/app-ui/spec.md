# Spec Delta

## Purpose

How the signed-in app presents a drop, its run, its approvals, its connections and its results, in the visual system of `apps/web/DESIGN.md` and the voice of `.agents/product-marketing.md`.

## ADDED Requirements

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
