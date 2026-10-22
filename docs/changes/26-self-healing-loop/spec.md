# Spec: turn Duo on and close the self-healing loop

Intent: [intent.md](intent.md)

## Requirements

1. `infra/Pulumi.prod.yaml` sets the three triggers active, filters unchanged.
2. An hourly pipeline schedule runs one `loop` job and nothing else (the scanners are off for that schedule).
3. The job reads ERROR entries of the Cloud Run service `app` from Cloud Logging, request counts from Cloud Monitoring, and, when an API key is set, error spans and logs from GitLab Observability.
4. It groups signals by a normalized fingerprint and files a `scout` issue for a problem seen 3 or more times in 6 hours that no scout issue of the last 14 days already covers. At most one issue per run; at most two scout issues with Duo at once.
5. Each issue is assigned to `duo-developer-gitlab-ai-hackathon` through a person's token, so the `assign` trigger starts the Developer flow.
6. For each open MR by the Developer flow that refers to a scout issue: mark a draft ready, request Duo Code Review, ask the Developer once to address open threads, and set auto-merge when the guardrails pass. Otherwise comment once that it needs a human.
7. For each scout issue with a merged MR: after 2 hours and 5 requests, verified if errors per request dropped 80% or more (comment the table, label `verified`, close); regressed after 24 hours without that drop (reopen, reassign up to twice, then `status::todo`).
8. Once a day it comments a digest on the `digest` issue.

## Design

- New workspace package `apps/ops` (TypeScript on Node 24, like the server): `loop.ts` (entry), `scout.ts`, `shepherd.ts`, `guardrails.ts`, `signals.ts`, `report.ts`, and thin clients `gitlab.ts` (REST through `fetch`, responses parsed with zod), `google.ts` (`google-auth-library`, which reads the Workload Identity Federation file `.gcp-auth` writes) and `o11y.ts` (SigNoz `POST /api/v5/query_range`, `SIGNOZ-API-KEY`).
- Why a job and not a flow chain: GitLab's `RunService` refuses non-human triggers and the event workers skip flow-caused events unless the `ai_flow_trigger_chaining` flag is on (`ee/app/services/ai/flow_triggers/run_service.rb`, `ee/app/workers/concerns/ai/cloud_events_flow_trigger_worker.rb`). The Developer flow takes only `assign` and `mention` (`foundational_flow/developer/definition.rb`). The job's person token makes each hand-off a human action.
- Auto-merge: `PUT /projects/:id/merge_requests/:iid/merge` with `auto_merge=true` and the reviewed `sha`.
- Review done: the Code Review service account's reviewer state isn't `unreviewed` (`GET merge_requests/:iid/reviewers`) and it wrote a note after the latest commit.
- Infra: a `gitlab-ops` Google service account with `logging.viewer` and `monitoring.viewer`, trusted from the GitLab `operations` environment only; CI variables `GCP_OPS_SERVICE_ACCOUNT`, `GITLAB_O11Y_URL` and, once its stack secret exists, `GITLAB_O11Y_API_KEY`; the `verified` label; the `wovain loop` schedule.
- Production traces: `OTEL_EXPORTER_OTLP_ENDPOINT` in `apphosting.yaml` points at the group's OTLP endpoint, which accepts data without a token.

## Areas of concern

- Prompt injection through logs: samples are redacted (tokens, keys, emails, JWTs, long opaque strings), clipped to 300 characters, fenced, and labeled untrusted in the issue.
- Credits: caps on issues, active problems, attempts and review rounds; pipeline failures go to the filtered Fix CI/CD trigger, not the scout.
- A wrong auto-merge: guardrails plus a green pipeline; protected paths need a person; the `sha` pin means a later push cancels it.
- Idle production: verification waits for traffic, so a quiet service never counts as fixed.
- Least privilege: the ops account reads logs and metrics only; it can't read Firestore or secrets.
