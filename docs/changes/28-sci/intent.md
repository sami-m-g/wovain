# Intent: measure software carbon intensity on every main pipeline

Issue: #28

## Problem

We say wovain is light (scale to zero, filtered Duo triggers, deterministic code), but nothing measures it.

## Desired outcome

- SCI per functional unit (one idea-to-paused-campaign run) computed with the Green Software Foundation's method: us-central1 grid intensity, compute time, CI minutes, model calls.
- A CI job recomputes it on every main pipeline and publishes the report.
- The README's Sustainability (SCI) section puts numbers on the gains, with estimates labeled.

## Constraints

- Every input is measured (Cloud Monitoring, the GitLab API) or a cited, labeled estimate.

## Open questions

None.
