import { defineNodeInstrumentation } from "evlog/next/instrumentation";

// An uncaught server error becomes an error-level wide event, which the
// error tracking drain sends to PostHog (src/lib/evlog.ts). Node runtime
// only, like evlog.
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

export const { onRequestError } = evlog;
