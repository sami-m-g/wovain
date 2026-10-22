# Spec: count the product funnel and scout the market weekly

Intent: [intent.md](intent.md)

## Requirements

1. A counter `wovain.funnel.events` with one attribute, `wovain.funnel.step`, goes to GitLab Observability over OTLP/HTTP with the traces.
2. Steps: `connect` (an OAuth connection finished), `idea` (a new design widget), `set_approved` (`record_design` publishing), `ad_approved` (`record_ad` added), `campaign_created` (`show_campaign_widget` ready or live), `autopilot_run` (`create_rules`).
3. A `wovain weekly` schedule (Mondays 07:30 UTC) runs a `weekly` job that comments the analysis on the digest issue and files at most one market intent per week.
4. The analysis reads merchants' records (counts only), Cloud Monitoring requests and billable instance time, and the token owner's Duo credits; it labels each price as an estimate with its source.

## Design

- `apps/server/src/lib/funnel.ts`: `stepOf(tool, args)` maps a `tools/call` to a step; `countStep` adds to the counter through `@opentelemetry/api` (a no-op without a provider). `routes/mcp.ts` counts after a non-5xx response; `routes/connect.ts` counts a finished connection.
- `telemetry.ts` registers a `MeterProvider` with `PeriodicExportingMetricReader` (30 s) and `OTLPMetricExporter`, sharing the trace resource, and flushes both providers on SIGTERM, since App Hosting scales to zero.
- `apps/ops/src/records.ts` lists `users/*/{connections,design,ad,campaign}` through the Firestore REST API with field masks; `analysis.ts` turns them into merchants per step, the biggest drop-off, cost estimates and the market intent (pure, tested); `weekly.ts` wires it up with `@tavily/core` and GitLab GraphQL `currentUser.creditsUsage`.
- Infra: `roles/datastore.viewer` for `gitlab-ops`, the `TAVILY_API_KEY` CI variable from the existing `tavily-api-key` stack secret, and the `wovain weekly` schedule with the scanners off.

## Areas of concern

- Privacy: masks read statuses, video states and rule counts only; nothing per merchant leaves `records.ts` except counts.
- Prompt injection: web titles are redacted, clipped and labeled untrusted; the intent goes to a person, not to Duo.
- Cost: no model call; the intent is assembled from data, so ranking is deterministic.
