# Proposal

Issue: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/51

## Why

The GitLab Monitor stage had no GitLab-native telemetry: traces went to Cloud Trace, logs to Cloud Logging and PostHog, and an incident didn't say which trace or PostHog issue it came from. GitLab Observability (beta, free on every tier) takes OTLP traces, metrics and logs next to the code, incidents and Duo flows.

## What Changes

- `apps/web` starts the OpenTelemetry Node SDK when `OTEL_EXPORTER_OTLP_ENDPOINT` is set: Next.js request spans, outgoing `fetch` spans and Node runtime metrics go to the group's OTLP endpoint.
- Mastra's spans and logs also go there (a second `OtelExporter`); Cloud Trace keeps its copy.
- evlog's wide events go there as OTLP logs, and every wide event and server `$exception` carries its trace ID.
- The ops job's heal phase links each incident to its trace (a timeline event) and sets the PostHog error tracking issue's description to the incident and trace URLs.
- Pulumi sets `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_RESOURCE_ATTRIBUTES` on both web services from `wovain:o11yOtlpEndpoint`.

## Capabilities

### New Capabilities

- `observability`: where wovain's engineering telemetry goes and how errors link across PostHog, GitLab incidents and traces.

### Modified Capabilities

None.

## Impact

`apps/web` (instrumentation, evlog, analytics), `packages/api` (Mastra observability), `apps/ops` (heal links, PostHog client), `infra/index.ts`, `docs/flows.md`. A person copies the OTEL endpoint from the group's Observe > Setup page into `wovain:o11yOtlpEndpoint`, and adds Error Tracking Write to the PostHog key for the PostHog side of the links.
