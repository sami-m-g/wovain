## MODIFIED Requirements

### Requirement: Onboarding wizard

While the `onboarding-wizard` flag is on, the system SHALL offer a signed-in designer one guided flow with these steps in order: signed in, what to sell, store setup, Meta and guardrails, design approval, ads, and the campaign page. A checklist SHALL show each step's state, with signed in already ticked, and a timer SHALL count from sign-up toward 10 minutes until the first campaign is created. Steps that happen elsewhere SHALL be cards whose links come back to the flow, and the flow SHALL tick them off by polling. Each step SHALL be skippable. With the flag off, the wizard's procedures SHALL answer 404 and the wizard SHALL NOT be linked.

#### Scenario: First visit

- **WHEN** a designer with no connections and no brand profile opens the wizard
- **THEN** the checklist shows signed in as done, the timer is running, and the what-to-sell step is open with drop directions to pick from

#### Scenario: Sent to the wizard until it is finished

- **WHEN** a designer whose flag is on signs up or signs in and lands on the overview before ever reaching the campaign page or skipping the flow
- **THEN** the overview redirects to the wizard, and once the campaign page has been shown or the flow was skipped it no longer does

#### Scenario: Flag off

- **WHEN** the flag is off for the designer
- **THEN** `onboarding.saveBrand` and `onboarding.resolveReferences` answer 404 and `onboarding.status` reports the wizard as off

#### Scenario: Design approved in the drop flow

- **WHEN** the designer follows the design approval card, approves a design in the drop flow and comes back
- **THEN** the design approval step is ticked off without a reload and the ads step is open

#### Scenario: Campaign page

- **WHEN** the run's first campaign is created
- **THEN** the timer stops, and the campaign page shows the run's products, the store link, the ads with their controls, the spend caps and the live KPIs

## ADDED Requirements

### Requirement: Guided highlights

The flow SHALL highlight each step's next action once, the first time the step opens on that browser. The highlight SHALL be dismissable, and SHALL NOT show again for that step once seen or dismissed.

#### Scenario: Returning to a step

- **WHEN** a designer opens the store setup step a second time
- **THEN** no highlight is shown
