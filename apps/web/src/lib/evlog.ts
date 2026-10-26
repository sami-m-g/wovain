import type { DrainContext } from "evlog";
import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createOTLPDrain } from "evlog/otlp";
import { createPostHogDrain } from "evlog/posthog";
import { composeDrains } from "evlog/toolkit";

import { ENV } from "@/env.server";

import { createCloudLoggingDrain } from "./cloud-logging";
import { activeTraceIds } from "./otel";

const service = "wovain-web";
const production = process.env.NODE_ENV === "production";

// With a PostHog key, production wide events (errors included) also go to
// PostHog Logs, linked to the merchant's person by `userId`.
const cloudLogging = createCloudLoggingDrain();
const posthogKey = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const posthog =
  posthogKey === undefined
    ? undefined
    : createPostHogDrain({
        apiKey: posthogKey,
        host: ENV.NEXT_PUBLIC_POSTHOG_HOST,
      });
// With an OTLP endpoint (src/lib/otel.ts), they also go to GitLab
// Observability as OTLP logs, linked to their request's trace.
const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
const gitlab =
  otlpEndpoint === undefined || otlpEndpoint === ""
    ? undefined
    : createOTLPDrain({ recordShape: "compact", semanticConventions: true });
const drains = composeDrains(
  [cloudLogging, posthog, gitlab].filter((drain) => drain !== undefined)
);

// Every wide event names the trace it belongs to (traceId, spanId), so a
// Cloud Logging line, a PostHog log and a GitLab Observability trace link up.
const productionDrain = async (ctx: DrainContext) => {
  const ids = activeTraceIds();
  if (ids !== undefined && ctx.event["traceId"] === undefined) {
    Object.assign(ctx.event, ids);
  }
  await drains(ctx);
};

// Production runs on Cloud Run: the Cloud Logging drain owns stdout, so
// evlog's own console output is off. Locally, events go to .evlog/logs.
const output = production
  ? { drain: productionDrain, silent: true }
  : { drain: createFsDrain() };

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service,
  ...output,
});

export const { register, onRequestError } = createInstrumentation({
  service,
  ...output,
});
