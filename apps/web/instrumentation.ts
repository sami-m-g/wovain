import { defineNodeInstrumentation } from "evlog/next/instrumentation";

const evlog = defineNodeInstrumentation(() => import("./src/lib/evlog"));

// OpenTelemetry to GitLab Observability (src/lib/otel.ts) starts first, so
// Next.js's request spans and evlog's events share trace IDs. Node runtime
// only, like evlog.
export const register: typeof evlog.register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOtel } = await import("./src/lib/otel");
    startOtel();
  }
  await evlog.register();
};

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
