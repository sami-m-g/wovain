import { createHash } from "node:crypto";

import type { DrainContext, WideEvent } from "evlog";

// Every server error reaches PostHog Error Tracking, the one place errors are
// watched (docs/flows.md, "One error sink"). This evlog drain turns each
// error-level wide event into a `$exception`: a procedure or route error on
// the request's wide event (evlog's oRPC middleware logs every procedure
// error), an uncaught error from Next's onRequestError, Better Auth's own
// error logs, a failed email send, and any plain-text stderr line evlog's
// captureOutput turns into an error event.
//
// A 4xx is the caller's mistake (401, 404, a failed validation): logged, not
// reported. A typed config fault such as META_NOT_CONFIGURED is a 503 and is.

const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;
const MAX_MESSAGE = 300;
const ID_SEGMENT =
  /\/(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{20,})(?=\/|$)/gu;
const DIGITS = /\d+/gu;

export interface ServerException {
  error: Error;
  distinctId: string | undefined;
  properties: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;
const statusOf = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : undefined;

const normalizePath = (path: string | undefined) =>
  path?.split("?")[0]?.replaceAll(ID_SEGMENT, "/:id");

// The error's own fields, however it was logged: a serialized Error (log.error
// on a request logger), a plain object or string under `error` (the global
// log), or message and stack at the top (onRequestError, captured stderr).
const errorFieldsOf = (event: WideEvent) => {
  const raw = event["error"];
  if (isRecord(raw)) {
    return {
      code: text(raw["code"]),
      message: text(raw["message"]),
      name: text(raw["name"]),
      stack: text(raw["stack"]),
      status: statusOf(raw["status"]),
    };
  }
  return {
    code: undefined,
    message: text(raw) ?? text(event["message"]),
    name: event["source"] === "stderr" ? "ConsoleError" : undefined,
    stack: text(event["stack"]),
    status: undefined,
  };
};

// The same error groups together whatever its message says: a coded error
// by its code and route, any other by its class, route and message without
// numbers.
const fingerprintOf = (parts: {
  code: string | undefined;
  method: string | undefined;
  message: string;
  name: string;
  path: string | undefined;
}) =>
  createHash("sha256")
    .update(
      [
        "server",
        parts.code ?? parts.name,
        parts.method ?? "",
        parts.path ?? "",
        parts.code === undefined ? parts.message.replaceAll(DIGITS, "<n>") : "",
      ].join("|")
    )
    .digest("hex")
    .slice(0, 16);

// The exception for one wide event, or undefined when it isn't a server error.
export const exceptionOf = (event: WideEvent): ServerException | undefined => {
  if (event.level !== "error" && event.level !== "fatal") {
    return;
  }
  const fields = errorFieldsOf(event);
  const status = fields.status ?? statusOf(event.status);
  if (status !== undefined && status >= CLIENT_ERROR && status < SERVER_ERROR) {
    return;
  }
  const name = fields.name ?? "Error";
  const message = (fields.message ?? fields.code ?? "Unknown server error")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
  const method = text(event["method"]);
  const path = normalizePath(text(event["path"]));
  const error = new Error(message);
  error.name = name;
  if (fields.stack !== undefined) {
    error.stack = fields.stack;
  }
  return {
    distinctId: text(event["userId"]),
    error,
    properties: {
      $exception_fingerprint: fingerprintOf({
        code: fields.code,
        message,
        method,
        name,
        path,
      }),
      code: fields.code,
      // Server, platform (forwarded by the ops job) or smoke (the synthetic
      // checks): browser exceptions carry none.
      error_source: "server",
      method,
      path,
      requestId: text(event["requestId"]),
      status,
      // The request's trace in GitLab Observability (src/lib/otel.ts, set on
      // the wide event by src/lib/evlog.ts); apps/ops links the PostHog
      // issue, its incident and the trace.
      trace_id: text(event["traceId"]),
    },
  };
};

export const createErrorTrackingDrain =
  (
    capture: (
      error: Error,
      distinctId: string | undefined,
      properties: Record<string, unknown>
    ) => Promise<void>
  ) =>
  async ({ event }: DrainContext): Promise<void> => {
    const exception = exceptionOf(event);
    if (exception !== undefined) {
      await capture(
        exception.error,
        exception.distinctId,
        exception.properties
      );
    }
  };
