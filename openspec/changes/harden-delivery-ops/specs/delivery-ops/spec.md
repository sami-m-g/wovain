# Spec Delta

## Purpose

How wovain's code is reviewed, updated and kept running from code, with GitLab Duo flows and infrastructure in Pulumi instead of manual UI steps.

## ADDED Requirements

### Requirement: Review on every merge request

Duo Code Review SHALL run when a merge request is created and again when Duo is requested as reviewer.

#### Scenario: New MR

- **WHEN** a person opens a merge request
- **THEN** Duo Code Review posts a review without anyone assigning it

### Requirement: Dependency policy

Dependency updates SHALL follow the Renovate policy in `.gitlab/renovate.json`, and each update MR SHALL get one verdict from the read-only `deps-review` flow.

#### Scenario: Major update

- **WHEN** a major version is available
- **THEN** Renovate waits for dashboard approval and the deps-review flow classifies its breaking changes for this repo

### Requirement: Flows enabled in code

Every custom Duo flow SHALL be enabled and triggered from `infra/` without manual UI steps or Maintainer access.

#### Scenario: New flow synced

- **WHEN** a custom flow is added to the catalog and synced
- **THEN** the next `pulumi up` enables it and creates its trigger

### Requirement: Status page domain

`status.wovain.com` SHALL resolve through Cloud Run and serve the GitLab Pages status site.

#### Scenario: Visit status page

- **WHEN** someone opens `https://status.wovain.com`
- **THEN** they see the status site
