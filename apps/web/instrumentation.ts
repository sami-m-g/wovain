import { defineNodeInstrumentation } from "evlog/next/instrumentation";

// An uncaught server error becomes an error-level wide event, which the
// error tracking drain sends to PostHog (src/lib/evlog.ts). Node runtime
// only, like evlog.
export const { register, onRequestError } = defineNodeInstrumentation(
  () => import("./src/lib/evlog")
);
