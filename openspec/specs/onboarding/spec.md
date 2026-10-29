# onboarding Specification

## Purpose

Take a new merchant from sign-up to a first drop: connect their accounts with a health check, set their brand from Qloo-resolved taste references, and choose how much wovain does on its own and how much it may spend.

## Requirements

### Requirement: Onboarding wizard

While the `onboarding-wizard` flag is on, the system SHALL offer a signed-in designer one guided flow with these steps in order: signed in, what to sell, store setup, Meta and guardrails, design approval, ads, and the campaign page. Steps that happen elsewhere SHALL be cards whose links come back to the flow, ticked off by polling. Each step SHALL be skippable. With the flag off, the wizard's procedures SHALL answer 404 and the wizard SHALL NOT be linked.

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

### Requirement: Taste references resolved with Qloo

The system SHALL accept 3 to 5 taste references and resolve each with Qloo `/search` across artists, brands, films, TV shows, books, podcasts, games and people. A reference Qloo doesn't match SHALL fall back to cultural proxies: a Tavily search, Nemotron naming concrete entities from the results, and each one resolved in Qloo. Entity IDs SHALL only come from Qloo.

#### Scenario: Known reference

- **WHEN** the designer enters "Wes Anderson"
- **THEN** the answer lists the Qloo entity with its ID, name and type, marked as found directly

#### Scenario: Unknown reference

- **WHEN** Qloo finds nothing for a small label's name and the web search names two of its collaborators that Qloo knows
- **THEN** the answer lists those two Qloo entities, each marked as a proxy of the reference, with the web sources

#### Scenario: Nothing found

- **WHEN** neither Qloo nor the proxies resolve a reference
- **THEN** the reference is reported as unresolved with no entity

### Requirement: Reference failures stay separate

Each Qloo, Tavily or Nemotron failure while resolving a reference SHALL be logged at error level and SHALL mark only that reference as failed; the other references SHALL still resolve.

#### Scenario: Qloo rate limit on one reference

- **WHEN** Qloo answers 429 for one of four references
- **THEN** that reference reads unresolved and failed, the error is logged, and the other three resolve

### Requirement: Brand profile saved to memory

Saving the brand step SHALL resolve the saved references on the server and SHALL upsert the designer's `brand_profile` (references, the Qloo entities those references resolved to, voice, palette, niches). The system SHALL NOT accept Qloo entities from the client. Saving SHALL write the Voice, Palette and typography, and Niches lines of the designer's taste memory, keeping the approved and rejected designs already there.

#### Scenario: Save the brand

- **WHEN** the designer saves the voice "dry, lowercase", the palette "#1A1A1A" and the niche "y2k racing"
- **THEN** `brand_profile` holds them and the taste memory reads `- Voice: dry, lowercase`, `- Palette and typography: #1A1A1A` and `- Niches: y2k racing`

#### Scenario: Saved without pressing Resolve

- **WHEN** the designer saves three references they never resolved
- **THEN** `brand_profile` holds the Qloo entities of exactly those three references

#### Scenario: Reference replaced after resolving

- **WHEN** the designer resolves "Kenzo", replaces it with "Prada" and saves
- **THEN** `brand_profile` holds Prada's entities and none of Kenzo's

### Requirement: Reference lookups cached and limited

The system SHALL keep each resolved reference in a cache shared by all designers, keyed by the trimmed, lowercase reference, and SHALL reuse it for 30 days, or for 10 minutes when a provider failed on it. Only references the cache does not hold SHALL reach Qloo, Tavily or Nemotron, and each designer SHALL start at most 20 such lookups an hour. Over the limit, `onboarding.resolveReferences` and `onboarding.saveBrand` SHALL answer 429 without calling a provider.

#### Scenario: Resolve, then save

- **WHEN** the designer resolves three references and then saves them
- **THEN** the save calls no provider

#### Scenario: Lookups in a loop

- **WHEN** a designer has started 20 new lookups in the last hour and asks for 5 more
- **THEN** the call answers 429 and no provider is called, while references already cached still resolve

### Requirement: Connection health

The system SHALL report, for each provider a drop needs, whether it is connected, expired or missing, what it is needed for, and whether a drop can start. fal SHALL NOT be listed while wovain draws on its own key.

#### Scenario: Expired Meta grant

- **WHEN** the Meta grant needs reconnecting
- **THEN** Meta reads expired with a reconnect button, and a drop can still start because Meta is needed only to stage ads

### Requirement: Checklist and timer

The guided flow SHALL show a checklist of its steps with each step's state, with signed in already ticked, and a timer that counts from sign-up toward 10 minutes and stops when the first campaign is created.

#### Scenario: Campaign created in 8 minutes

- **WHEN** the first campaign is created 8 minutes and 30 seconds after sign-up
- **THEN** the timer stops at 8:30, says the campaign went live in under 10 minutes, and the checklist shows every step done

### Requirement: Guided highlights

The flow SHALL highlight each step's next action once, the first time the step opens on that browser. The highlight SHALL be dismissable, and SHALL NOT show again for that step once seen or dismissed.

#### Scenario: Returning to a step

- **WHEN** a designer opens the store setup step a second time
- **THEN** no highlight is shown
