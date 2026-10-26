import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createPostHogDrain } from "evlog/posthog";
import { composeDrains } from "evlog/toolkit";

import { ENV } from "@/env.server";

import { captureServerException } from "./analytics";
import { createCloudLoggingDrain } from "./cloud-logging";
import { createErrorTrackingDrain } from "./error-tracking";

const service = "wovain-web";
const production = process.env.NODE_ENV === "production";

// With a PostHog key, production wide events also go to PostHog Logs, linked
// to the merchant's person by `userId`, and every error-level one becomes a
// `$exception` in PostHog Error Tracking, where self-healing watches
// (docs/flows.md, "One error sink").
const cloudLogging = createCloudLoggingDrain();
const posthogKey = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const productionDrain =
  posthogKey === undefined
    ? cloudLogging
    : composeDrains([
        cloudLogging,
        createPostHogDrain({
          apiKey: posthogKey,
          host: ENV.NEXT_PUBLIC_POSTHOG_HOST,
        }),
        createErrorTrackingDrain(captureServerException),
      ]);

// Production runs on Cloud Run: the Cloud Logging drain owns stdout, so
// evlog's own console output is off. Locally, events go to .evlog/logs.
const output = production
  ? { drain: productionDrain, silent: true }
  : { drain: createFsDrain() };

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service,
  ...output,
});

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
