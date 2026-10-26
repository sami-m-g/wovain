# Spec Delta

## Purpose

How wovain's changes reach production gradually through GitLab feature flags and Cloud Run canaries, and how they are rolled back and cleaned up without a person.

## ADDED Requirements

### Requirement: Flags as code

Every feature flag SHALL be declared once in `packages/core/src/flag-registry.ts`, with an owner, an expiry and a rollout per GitLab environment, and SHALL be applied to GitLab by Pulumi.

#### Scenario: Rollout step

- **WHEN** a person raises `mastra-runs` from 10% to 50% of production users in the registry
- **THEN** the merge request's Pulumi preview shows the strategy change, and the merge applies it

### Requirement: Fail closed

The app SHALL treat every flag as off while GitLab's Unleash API is unreachable or hasn't answered yet.

#### Scenario: Cold start without GitLab

- **WHEN** an instance starts and can't reach GitLab
- **THEN** every flag evaluates to false and no stale state is read from disk

### Requirement: Qloo on free and demo plans only

`trends-qloo` SHALL be evaluated with the merchant's plan, and SHALL be off for paid plans whatever GitLab returns.

#### Scenario: Paid merchant researches trends

- **WHEN** a merchant on a paid plan starts trend research
- **THEN** Qloo is never called and the ideas come from Tavily alone

### Requirement: Paid plans off at launch

`billing-paid-plans` SHALL be off in every environment until billing turns it on.

#### Scenario: Checkout at launch

- **WHEN** a merchant opens the billing page at launch
- **THEN** checkout, plan changes and pack purchases are unavailable

### Requirement: Exposures in PostHog

Each flag evaluation for a signed-in user SHALL be sent to PostHog once per user, flag and value as a `$feature_flag_called` event.

#### Scenario: KPI by flag value

- **WHEN** a person breaks a KPI insight down by `$feature/mastra-runs`
- **THEN** PostHog splits it by the users who had the flag on and off

### Requirement: Canary deploys

Each production deploy of the web app SHALL first serve a small share of traffic from a tagged revision, and SHALL be promoted only after a check window without excess errors.

#### Scenario: Bad deploy

- **WHEN** the canary revision fails its probes or its 5xx rate exceeds the threshold
- **THEN** all traffic returns to the stable revision, the job fails, and a `release-guard` issue records the evidence

### Requirement: Automatic mitigation after promotion

When production degrades after a guarded flag change or a deploy, the release guard SHALL switch that flag off or roll traffic back, at most once an hour and three times a day, and SHALL hand the diagnosis to the `wovain release-guard` Duo flow.

#### Scenario: Flag causes errors

- **WHEN** 5xx responses spike within two hours of `fault-injection-checkout` being turned on
- **THEN** the ops job switches the flag off and files a `release-guard` issue that the Duo flow diagnoses

### Requirement: Flag hygiene

Flags past their expiry, release flags serving all of production for 14 days, and flags missing from the registry or from GitLab SHALL get a cleanup issue for their owner.

#### Scenario: Expired flag

- **WHEN** `trends-qloo` passes its 2026-11-05 expiry
- **THEN** the next ops run opens a `flag-cleanup` issue for it
