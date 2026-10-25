import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "wovain-web",
  ...(process.env.NODE_ENV === "production" ? {} : { drain: createFsDrain() }),
});

export const { register, onRequestError } = createInstrumentation({
  service: "wovain-web",
});
