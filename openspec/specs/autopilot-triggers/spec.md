# autopilot-triggers Specification

## Purpose

When autopilot acts on its own: scheduled per-brand scans of Qloo and the news, suggestions backed by evidence, runs queued through the approval queue within the autonomy level, a daily credit cap, and the narrated decision log.

## Requirements

### Requirement: Scheduled scan per brand

An Inngest cron SHALL send one scan event for each merchant with a brand profile whose agent is not paused, every 6 hours. A merchant SHALL get at most one scheduled and one requested scan per 6 hours, and two scans of one brand SHALL never run at once. The scan SHALL do nothing for a merchant whose `autopilot-triggers` flag is off.

#### Scenario: Cron fires

- **WHEN** the cron runs and two merchants have brand profiles, one of them paused
- **THEN** one scan event is sent, for the merchant who is not paused

#### Scenario: Scan requested twice

- **WHEN** a merchant asks for a scan twice within 6 hours
- **THEN** the second scan does not run

### Requirement: Suggestions backed by evidence

A scan SHALL ask Qloo for brands rising with the brand's audience (`bias.trends`) when the brand has Qloo entities, and SHALL search Tavily for news from the past week on the top rising names and on the brand's niches. A query with recent, relevant news SHALL become a suggestion of kind `drop` whose sources list the Qloo entity and the news links. A failed call SHALL be logged at error level and SHALL not stop the other searches.

#### Scenario: Rising brand with news

- **WHEN** Qloo says a brand is rising with the audience and Tavily finds news about it from this week
- **THEN** a suggestion with trigger `qloo` is saved with the Qloo entity and the news links as sources

#### Scenario: No news

- **WHEN** no search finds recent, relevant news
- **THEN** no suggestion is saved and the trace says why

#### Scenario: Qloo fails

- **WHEN** Qloo answers with an error
- **THEN** the error is logged at error level and the niche searches still run

### Requirement: Suggestion limits

A scan SHALL create at most two suggestions, and SHALL skip a subject already suggested in the last 7 days.

#### Scenario: Repeat subject

- **WHEN** a scan matches a subject suggested 3 days ago
- **THEN** no new suggestion is saved for it

### Requirement: Suggestion notifications

Each new suggestion SHALL send a `wovain/trigger.fired` event with its ID and a `wovain/notify` event of kind `suggestion` with its title and rationale. Saving and announcing SHALL be separate durable steps, and each event SHALL carry an ID derived from the suggestion, so a retry neither loses nor repeats an announcement.

#### Scenario: Suggestion saved

- **WHEN** a scan saves a suggestion
- **THEN** both events are sent for the merchant

#### Scenario: Announcement retried

- **WHEN** sending the events fails after the suggestion was saved
- **THEN** the retry sends them for the saved suggestion and does not save it again

### Requirement: Autopilot acts only on its own suggestions

Autopilot SHALL act only on its own suggestions: kind `drop` with trigger `qloo` or `trend`. Suggestions from other workstreams (for example `scale_ad` from a `performance` trigger) SHALL NOT be queued as `autopilot.run.start` and SHALL NOT appear in the decision log.

#### Scenario: Another workstream's suggestion

- **WHEN** a `scale_ad` suggestion with trigger `performance` fires
- **THEN** autopilot enqueues nothing and the decision log does not list it

### Requirement: Autopilot acts within the autonomy level

When a suggestion fires and the merchant is entitled to autopilot within the credit cap, autopilot SHALL enqueue `autopilot.run.start` in the approval queue, proposed by `autopilot`, once per suggestion. On approval (by the merchant or by policy) the run SHALL start; it SHALL decide its own gates only when the policy would allow `store.product.publish` for the merchant, and SHALL otherwise wait at the ideas gate. The approval SHALL be recorded `done` with the run ID, or `failed` with the reason.

#### Scenario: Suggest level

- **WHEN** a suggestion fires for a merchant on `suggest`
- **THEN** the approval waits for the merchant and no run starts

#### Scenario: Draft level

- **WHEN** a suggestion fires for a merchant on `draft`
- **THEN** the policy approves it and a run starts that waits at the ideas gate

#### Scenario: Recording a started run fails

- **WHEN** the run starts but saving its run ID fails
- **THEN** the approval is not recorded `failed`, and the retry records it `done` with the run ID

#### Scenario: Publish level

- **WHEN** a suggestion fires for a merchant on `publish_ads_paused`
- **THEN** a run starts in autopilot mode and its campaigns stay paused

### Requirement: Autopilot credit cap

Autopilot SHALL NOT start a run when the credits its runs used today plus the run's estimate would pass the plan's `autopilotDailyCredits`. Each `autopilot.run.start` queued today SHALL count as the credits its run reserved, and at least the run estimate while the run has not started or is still going. The suggestion SHALL stay open for the merchant, and the trace SHALL say the cap was reached.

#### Scenario: Cap reached

- **WHEN** autopilot already spent the day's cap
- **THEN** no approval is enqueued and the suggestion stays `new`

#### Scenario: Run still going

- **WHEN** a merchant on Free has one autopilot run started today that has reserved no credits yet
- **THEN** a second suggestion hits the cap

### Requirement: Decision log

The merchant SHALL see their latest suggestions with their evidence, the policy's decision and the run started, narrated step by step from the decision trace, and SHALL be able to start or dismiss a suggestion and request a scan. Starting a suggestion whose last approval ended without a run (failed, denied, rejected, expired) SHALL queue a new approval; the suggestion SHALL be accepted only once a run is queued or started, and otherwise the merchant SHALL see why.

#### Scenario: Open the log

- **WHEN** the merchant opens the autopilot page
- **THEN** each suggestion lists its sources and a sentence for each traced step

#### Scenario: Start after a failed run start

- **WHEN** the merchant starts a suggestion whose run failed to start
- **THEN** a new approval is queued and the suggestion is accepted once it is approved
