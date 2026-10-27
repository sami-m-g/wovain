import { z } from "zod";

// GitLab Observability (docs.gitlab.com/operations/observability): apps/web
// sends its traces, evlog's wide events and runtime metrics to the group's
// instance over OTLP (apps/web/src/lib/otel.ts). Each server error carries
// its trace ID: in the wide event (Cloud Logging's jsonPayload.traceId) and
// on PostHog's $exception (trace_id). The heal phase links the incident to
// that trace, and the PostHog issue to the incident, so a person (or Duo)
// can go from any of the three to the others.

const TRACE_ID = /^[0-9a-f]{32}$/u;

// A W3C trace ID, or undefined for anything else (the value comes from logs
// and events, which callers can shape).
export const traceIdOf = (value: unknown) => {
  const parsed = z.string().regex(TRACE_ID).safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

// The trace's page in the group's instance (GitLab Observability's UI is
// SigNoz, whose trace view lives at /trace/<id>).
export const traceUrl = (base: string, traceId: string) =>
  `${base.replace(/\/+$/u, "")}/trace/${traceId}`;

// The newest trace ID among a PostHog issue's server exceptions (browser
// exceptions have none).
export const issueTraceQuery = (issue: string) =>
  `SELECT properties.trace_id FROM events WHERE event = '$exception' AND properties.$exception_issue_id = '${z.uuid().parse(issue)}' AND properties.trace_id IS NOT NULL AND properties.trace_id != '' ORDER BY timestamp DESC LIMIT 1`;

// The PostHog issue's description: where its incident and trace are, so the
// link goes both ways. Only URLs ops built itself.
export const posthogIssueDescription = (links: {
  incident: string;
  trace?: string | undefined;
}) =>
  [
    `GitLab incident: ${links.incident}`,
    ...(links.trace === undefined
      ? []
      : [`Trace in GitLab Observability: ${links.trace}`]),
    "Set by wovain ops (docs/flows.md, flow 1).",
  ].join("\n");
