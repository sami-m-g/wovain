# ADR 0003: Move development to GitHub

- Status: accepted
- Date: 2026-10-27
- Supersedes: the GitLab parts of [ADR 0001: Progressive delivery](0001-progressive-delivery.md)

## Context

wovain was built on GitLab for the GitLab Transcend hackathon. The loop used GitLab issues and merge requests, GitLab CI, GitLab feature flags, Duo flows (self-healing, scout, developer, release guard) and an ops job.

Transcend ended and the GitLab project is archived, so it is read-only. Nothing new can ship from it.

## Decision

- Code, issues and pull requests live on GitHub (`sami-m-g/wovain`). A PR says `Closes #<issue>`.
- CI is GitHub Actions. Dependabot keeps dependencies current.
- The GitLab DevSecOps loop is removed: the pipeline, the Duo flows, the ops job (`apps/ops`), self-healing, the KPI scout, the release guard, canary promotion and the status page.
- DevSecOps will be rebuilt on GitHub later. Until then, review and merge are manual.
- Feature flags keep the typed registry in `packages/core/src/flag-registry.ts`. The provider behind it is decided separately.
- `docs/submissions/` stays as the record of the hackathon entries.

## Consequences

- No automatic fix PRs, KPI issues, canary rollbacks or release-guard flag kills until the new setup lands.
- A bad deploy is rolled back by hand.
- Old ADRs and submissions still mention GitLab. They are records and carry a note.
- The GitLab Pages status page is gone.
