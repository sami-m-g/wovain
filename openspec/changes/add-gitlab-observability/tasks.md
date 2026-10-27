# Tasks

- [x] Start the OpenTelemetry Node SDK in `apps/web` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (request, fetch spans; runtime metrics).
- [x] Export Mastra spans and logs to the same endpoint.
- [x] Send evlog wide events as OTLP logs, with trace and span IDs on every event and `trace_id` on server exceptions.
- [x] Link each heal incident to its trace and its PostHog issue (`apps/ops/src/o11y.ts`).
- [x] Set the OTLP environment on both web services from `wovain:o11yOtlpEndpoint` (Pulumi).
- [x] Document the Monitor stage and the demo path in `docs/flows.md`.
- [ ] A person sets `wovain:o11yOtlpEndpoint` from Observe > Setup and adds Error Tracking Write to the PostHog key.
