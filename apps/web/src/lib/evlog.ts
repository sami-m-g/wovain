import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createOTLPDrain } from "evlog/otlp";
import { createPostHogDrain } from "evlog/posthog";
import { composeDrains } from "evlog/toolkit";

import { ENV } from "@/env.server";

import { captureServerException } from "./analytics";
import { createCloudLoggingDrain } from "./cloud-logging";
import { createErrorTrackingDrain } from "./error-tracking";
import { activeTraceIds } from "./otel";

const service = "wovain-web";
const production = process.env.NODE_ENV === "production";

// With a PostHog key, production wide events also go to PostHog Logs, linked
// to the merchant's person by `userId`, and every error-level one becomes a
// `$exception` in PostHog Error Tracking, the one error sink.
const cloudLogging = createCloudLoggingDrain();
const posthogKey = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const posthog =
  posthogKey === undefined
    ? []
    : [
        createPostHogDrain({
          apiKey: posthogKey,
          host: ENV.NEXT_PUBLIC_POSTHOG_HOST,
        }),
        createErrorTrackingDrain(captureServerException),
      ];
// With an OTLP endpoint (src/lib/otel.ts), they also go there as OTLP logs,
// linked to their request's trace. Errors are still tracked in PostHog only;
// the OTLP backend gets them as logs and spans.
const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
const otlp =
  otlpEndpoint === undefined || otlpEndpoint === ""
    ? []
    : [createOTLPDrain({ recordShape: "compact", semanticConventions: true })];
const drains = composeDrains([cloudLogging, ...posthog, ...otlp]);

// Every wide event names the trace it belongs to (traceId, spanId), so a
// Cloud Logging line, a PostHog log or exception and an OTLP trace link up.
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

// createEvlog inits evlog's process-wide logger without a drain unless the
// instrumentation locked it first. On next, nothing logged with `log` from
// "evlog" outside a request (packages/api: a durable run's failure on
// /api/inngest) reached Cloud Logging or PostHog (QA, 2026-10-29). The
// global logger gets the app's drain here.
initLogger({ env: { service }, ...output });

// stderr lines (a library's console.error, such as Varlock's leak guard) become
// error events, so plain text reaches error tracking too. stdout stays the
// Cloud Logging drain's. PostHog's and evlog's own complaints are skipped:
// reporting them would go through the same drain.
export const { register, onRequestError } = createInstrumentation({
  captureOutput: {
    ignore: [/\[PostHog/u, /\[evlog/u],
    stdout: false,
  },
  service,
  ...output,
});
