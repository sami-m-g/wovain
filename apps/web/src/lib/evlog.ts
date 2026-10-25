import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

import { createCloudLoggingDrain } from "./cloud-logging";

const service = "wovain-web";
const production = process.env.NODE_ENV === "production";

// Production runs on Cloud Run: the Cloud Logging drain owns stdout, so
// evlog's own console output is off. Locally, events go to .evlog/logs.
const output = production
  ? { drain: createCloudLoggingDrain(), silent: true }
  : { drain: createFsDrain() };

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service,
  ...output,
});

export const { register, onRequestError } = createInstrumentation({
  service,
  ...output,
});
