# Spec Delta

## ADDED Requirements

### Requirement: Pixel set-up on the single Meta grant

While the `meta-pixel-automation` flag is on, the pixel step SHALL offer to set up the pixel with the designer's Meta grant. Set-up SHALL use the ad account's only dataset; with several, the one wovain created, else the one that last received an event. With none, it SHALL create one under the business that owns the ad account and share it with that ad account, or create it on the ad account when no business owns it. With the flag off, `store.setupPixel` SHALL answer 404.

#### Scenario: No pixel yet

- **WHEN** a designer whose business-owned ad account has no dataset chooses Set up my pixel
- **THEN** wovain creates the dataset under the business, shares it with the ad account, sends a test event, and shows the pixel ID to paste in Fourthwall

#### Scenario: Several pixels

- **WHEN** the ad account can use several datasets, one of them named by wovain
- **THEN** the checklist and set-up use the dataset wovain named

### Requirement: Pixel test event and paste

After set-up, wovain SHALL send one Conversions API test event with a test event code and SHALL show whether Meta received it. Pasting the pixel ID into Fourthwall SHALL stay the designer's step, since Fourthwall has no API for it. The step SHALL tick off only when Meta reports events from the shop's hosts.

#### Scenario: Test event only

- **WHEN** Meta receives the test event
- **THEN** the step shows the test event code to find it in Events Manager, and the step stays open until real visits from the shop arrive
