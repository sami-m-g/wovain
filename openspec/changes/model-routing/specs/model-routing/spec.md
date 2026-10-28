# Spec Delta

## ADDED Requirements

### Requirement: Agents run on the model for their job

While the `model-routing` flag is on for the merchant, each model call SHALL run on the model of its job: default for design briefs, research themes and ad copy; reasoning for the design judge's verdict and autopilot's decisions; vision for reading drawn artwork; fast for ad judges, scorers and the injection and PII guardrails; safety for moderation. While the flag is off, every call SHALL run on the models it used before.

#### Scenario: Routed judge

- **WHEN** a merchant with the flag on gets a design judged
- **THEN** the judge looks at the drawn PNG on the vision model and gives its verdict on the reasoning model

#### Scenario: Flag off

- **WHEN** the flag is off for the merchant
- **THEN** every agent runs on `NEMOTRON_MODEL` (or `NEMOTRON_VISION_MODEL` to read images), as before

### Requirement: Buyer-facing text states only what tools produced

While the flag is on, every number (amounts, percentages, counts) and every listed claim ("best-selling", "#1", "guaranteed"…) in ad copy and in a listing's title and description SHALL appear in the input the agent was given. Decades, hex colors and names that contain digits are not numbers. An answer that breaks this SHALL be sent back once, naming what to remove; a second answer that breaks it SHALL fail the step with an `UNGROUNDED_CLAIM` error.

#### Scenario: Invented number

- **WHEN** the ad copy says "Loved by 10,000 fans" and no tool result holds 10,000
- **THEN** the copy is rewritten without it, or the step fails naming "10,000"

### Requirement: Ad copy is scored

While the flag is on, when a campaign is staged, each ad variant SHALL be judged by the ad-copy-quality and Meta-policy judges, and the campaign's ad score SHALL be the share of passed verdicts, 0 to 100, shown on the insights page. A scoring failure SHALL be reported to error tracking and SHALL NOT stop the campaign.

#### Scenario: Scored campaign

- **WHEN** a campaign's two variants get three passes out of four verdicts
- **THEN** the insights page shows an ad score of 75 for its drop

### Requirement: Which model did what

While the flag is on, every agent call and grounding check of a run SHALL be saved to the run's decision trace with its agent, model, time and result, never with the input's values. The merchant SHALL see the model per job and the run's trace in order at `/dashboard/models`, linked from each run.

#### Scenario: Viewing a run

- **WHEN** the merchant opens Models for a run
- **THEN** they see each step (brief, vision, judge, ad copy, ad judge, checks) with its job, model, seconds and whether it passed

#### Scenario: Flag off

- **WHEN** the flag is off for the merchant
- **THEN** nothing is traced and the page answers that the trace isn't available
