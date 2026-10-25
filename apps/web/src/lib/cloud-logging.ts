import type { DrainContext, WideEvent } from "evlog";
import { formatEventSummary } from "evlog/toolkit";

// An evlog drain for Cloud Run: each wide event becomes one line of JSON on
// stdout, which Cloud Run's logging agent turns into a structured Cloud
// Logging entry (cloud.google.com/logging/docs/structured-logging). Error
// events carry the ReportedErrorEvent type, a serviceContext and the stack
// as their message, which is what Error Reporting groups by
// (cloud.google.com/error-reporting/docs/formatting-error-messages).

const SEVERITY = {
  debug: "DEBUG",
  error: "ERROR",
  fatal: "CRITICAL",
  info: "INFO",
  trace: "DEBUG",
  warn: "WARNING",
} as const satisfies Record<WideEvent["level"], string>;

const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

const REPORTED_ERROR_EVENT =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

interface LoggedError {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
}

const isLoggedError = (value: unknown): value is LoggedError =>
  typeof value === "object" && value !== null && "message" in value;

// Error Reporting needs a stack trace in the message, or a reportLocation.
const errorFields = (event: WideEvent) => {
  const { error } = event;
  if (!isLoggedError(error)) {
    return;
  }
  if (typeof error.stack === "string" && error.stack.length > 0) {
    return { "@type": REPORTED_ERROR_EVENT, message: error.stack };
  }
  const name = typeof error.name === "string" ? error.name : "Error";
  return {
    "@type": REPORTED_ERROR_EVENT,
    context: {
      reportLocation: {
        functionName: typeof event.path === "string" ? event.path : "unknown",
      },
    },
    message: `${name}: ${String(error.message)}`,
  };
};

export const createCloudLoggingDrain =
  () =>
  ({ event }: DrainContext): void => {
    const severity = SEVERITY[event.level];
    // A 4xx is the caller's mistake (401, 404): logged as an error, but kept
    // out of Error Reporting.
    const clientError =
      typeof event.status === "number" &&
      event.status >= CLIENT_ERROR &&
      event.status < SERVER_ERROR;
    const reportsError =
      (severity === "ERROR" || severity === "CRITICAL") && !clientError;
    const entry = {
      ...event,
      message: formatEventSummary(event) || event.service,
      // Cloud Run sets K_REVISION, so errors group by deployed revision.
      serviceContext: {
        service: event.service,
        version: event.version ?? process.env.K_REVISION ?? "unknown",
      },
      severity,
      time: event.timestamp,
      ...(reportsError ? errorFields(event) : undefined),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  };
