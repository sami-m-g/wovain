import type { DrainContext } from "evlog";
import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";
import { createPostHogDrain } from "evlog/posthog";

import { ENV } from "@/env.server";

import { createCloudLoggingDrain } from "./cloud-logging";

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
const productionDrain =
  posthog === undefined
    ? cloudLogging
    : async (ctx: DrainContext) => {
        cloudLogging(ctx);
        await posthog(ctx);
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
