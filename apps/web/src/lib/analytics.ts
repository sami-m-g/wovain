import type { Context } from "@wovain/api/context";
import { after } from "next/server";
import { PostHog } from "posthog-node";

import { ENV } from "@/env.server";

// Server-side funnel events (posthog.com/docs/libraries/node), keyed by user
// id: the same distinct id the browser identifies with. Each event is sent
// after the response, while Cloud Run still allocates CPU to the request.
// Without a key, procedures get no analytics.
const key = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const posthog =
  key === undefined
    ? undefined
    : new PostHog(key, { host: ENV.NEXT_PUBLIC_POSTHOG_HOST });
// The same super-property the browser registers (instrumentation-client.ts).
const environment =
  new URL(ENV.BETTER_AUTH_URL).hostname === "wovain.com"
    ? "production"
    : "development";

export const analytics: Context["analytics"] = posthog && {
  capture: ({ properties, ...event }) => {
    after(() =>
      posthog.captureImmediate({
        ...event,
        properties: { ...properties, environment },
      })
    );
  },
};
