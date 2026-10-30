# Spec Delta

## ADDED Requirements

### Requirement: Store setup checklist

The Store page SHALL show a setup checklist for the connected shop: shop connected as owner or manager, payouts, shop live, shipping and the Meta pixel on the shop (required), plus custom domain and policies (optional). Each open step SHALL be done by wovain through the approval queue or offer a one-click deep link into Fourthwall. While a required step is open, the page SHALL poll so a step finished in Fourthwall ticks off without a reload.

#### Scenario: Payouts finished in Fourthwall

- **WHEN** the designer follows the payouts link and finishes payouts in Fourthwall
- **THEN** the payouts step ticks off on the Store page within seconds, without a reload

#### Scenario: Go live for me

- **WHEN** the designer asks wovain to take a coming-soon shop live and confirms
- **THEN** a `store.site.set_status` action is queued and recorded in the decision trace

### Requirement: Pixel on the shop

The pixel step SHALL show the pixel wovain found on the designer's Meta ad account, to paste in Fourthwall, and SHALL be done when Meta reports events from one of the shop's hosts in the last 7 days. Without a Meta connection, the step SHALL wait on Meta and link to connect it.

#### Scenario: Test visit

- **WHEN** the designer pastes the pixel ID in Fourthwall and opens their storefront
- **THEN** the pixel step ticks off once Meta reports the visit from the shop's host

### Requirement: Setup reads fail soft

A part of the checklist that can't be read SHALL be logged at error level and shown as not known, and SHALL NOT fail the rest of the checklist.

#### Scenario: Meta answers an error

- **WHEN** Meta's dataset stats fail
- **THEN** the error reaches Error Tracking and the other steps still show
