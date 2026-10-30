## ADDED Requirements

### Requirement: Video ad creatives

Where the environment sets a video model and prices the `video` step, a product that goes live SHALL get short video ad clips (9:16 and 1:1) made by fal from its mockup, each charged once in credits however often its step is retried. A clip that fails SHALL be logged at error level and left out, and SHALL NOT stop the campaign. The Campaign step SHALL show the clips next to the images, and campaign build SHALL add a video ad for each clip next to the image ads.

#### Scenario: Product published

- **WHEN** a product goes live where video ads are on
- **THEN** fal makes its 9:16 and 1:1 clips, each charged once, and they are saved on the product

#### Scenario: Retried step

- **WHEN** a clip's step is retried after fal took the request
- **THEN** the same fal request is read again and no credits are charged again

#### Scenario: Clip fails

- **WHEN** fal or Meta fails on a clip after its retries
- **THEN** the failure is logged at error level and the campaign launches with the clips that worked and the image ads

#### Scenario: Video ads off

- **WHEN** the environment sets no video model or no `video` price
- **THEN** no clip is requested and the campaign runs image ads only
