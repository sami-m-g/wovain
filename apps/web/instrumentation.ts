import { defineNodeInstrumentation } from "evlog/next/instrumentation";

const evlog = defineNodeInstrumentation(() => import("./src/lib/evlog"));

export const { register } = evlog;

// An uncaught server error goes to evlog's wide event and to PostHog Error
// Tracking (src/lib/error-tracking.ts), each on its own: one failing doesn't
// stop the other. Node runtime only, like evlog.
export const onRequestError: typeof evlog.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { captureRequestError } = await import("./src/lib/error-tracking");
  await Promise.allSettled([
    evlog.onRequestError(...args),
    captureRequestError(...args),
  ]);
};
