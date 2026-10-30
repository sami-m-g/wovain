## ADDED Requirements

### Requirement: Director-made video ads

Where the environment sets the ad video models and prices the `adVideo` step, a product that goes live SHALL get one finished video ad with sound, in a 9:16 and a 4:5 cut, made by the `ad-video` workflow from a Director agent's concept, with a cast person matching the idea's Qloo buyers and a Reviewer agent's check. It SHALL cost `creditCost.adVideo` credits once, and nothing when it isn't saved. A failed ad SHALL NOT stop the campaign.

#### Scenario: Product published

- **WHEN** a product goes live where director-made ads are on
- **THEN** the workflow makes its 9:16 and 4:5 ad, the Reviewer passes it, it is saved on the product and its credits are spent once

#### Scenario: Reviewer asks for a redo

- **WHEN** the Reviewer fails the first cut
- **THEN** the Director revises the concept with the Reviewer's fixes, the ad is made once more and reviewed again, and no further redo follows

#### Scenario: Retried step

- **WHEN** a step is retried after fal took its request
- **THEN** the same fal request is read again and nothing is paid or charged again

#### Scenario: Ad fails

- **WHEN** a step fails after its retries, or the Reviewer fails the redo
- **THEN** the failure is logged at error level, the held credits are given back, no video is saved and the campaign runs the image ads

#### Scenario: AI-generated person disclosed

- **WHEN** a director-made ad runs on Meta
- **THEN** the video carries the label "AI-generated model" and the ad's text says the model is AI-generated

#### Scenario: Campaign step

- **WHEN** the merchant opens the Campaign step of a product with a director-made ad
- **THEN** each cut plays in its own shape, muted and autoplaying, with controls to turn the sound on, and is labelled as AI-generated
