# Spec Delta

## Purpose

Where wovain's engineering telemetry goes, and how one production error links across PostHog, a GitLab incident and its trace.

## ADDED Requirements

### Requirement: Telemetry to GitLab Observability

When an OTLP endpoint is configured, the web app SHALL send its request and outgoing fetch traces, Mastra's spans, its wide-event logs and Node runtime metrics to GitLab Observability over OTLP, and SHALL send nothing when none is configured.

#### Scenario: Endpoint configured

- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` is set on the service
- **THEN** each request produces a trace and a log record with the same trace ID in GitLab Observability

#### Scenario: No endpoint

- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, as in local runs and tests
- **THEN** no OpenTelemetry SDK starts and nothing is exported

### Requirement: Errors linked both ways

Every server error SHALL carry its trace ID, and each heal incident SHALL link the error's trace and its PostHog error tracking issue, whose description SHALL link back to the incident.

#### Scenario: Server error becomes an incident

- **WHEN** the ops job files a heal incident for an error with a trace ID
- **THEN** the incident's timeline links the trace in GitLab Observability, and the PostHog issue's description links the incident and the trace
