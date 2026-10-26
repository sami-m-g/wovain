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
// The same property the browser adds to its events (src/lib/analytics-client.ts).
const environment =
  new URL(ENV.BETTER_AUTH_URL).hostname === "wovain.com"
    ? "production"
    : "development";

/**
 * Sends a server error to PostHog Error Tracking as a `$exception` event
 * (posthog.com/docs/error-tracking/installation/node), keyed by the
 * merchant's user id when known; without one, PostHog sends it anonymously.
 * The returned promise settles once the event is sent.
 *
 * posthog-node skips an error that carries its "previously captured" flag,
 * so once sent, the error is flagged: a procedure error that oRPC rethrows
 * to a server render, then to `onRequestError`, is reported once.
 */
export const captureServerException = async (
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>
): Promise<void> => {
  if (posthog === undefined) {
    return;
  }
  // The SDK checks the flag synchronously, before its first await.
  const sent = posthog.captureExceptionImmediate(error, distinctId, {
    ...properties,
    environment,
  });
  if (typeof error === "object" && error !== null) {
    Object.assign(error, { __posthog_previously_captured_error: true });
  }
  await sent;
};

export const analytics: Context["analytics"] = posthog && {
  capture: ({ properties, ...event }) => {
    after(() =>
      posthog.captureImmediate({
        ...event,
        properties: { ...properties, environment },
      })
    );
  },
  captureException: (error, { distinctId, properties }) => {
    const sent = captureServerException(error, distinctId, properties);
    after(() => sent);
  },
};
