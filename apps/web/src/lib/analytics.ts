import type { Context } from "@wovain/api/context";
import { log } from "evlog";
import { after } from "next/server";
import { PostHog } from "posthog-node";

import { ENV } from "@/env.server";
import { analyticsEnvironment } from "@/lib/analytics-environment";

// Server-side funnel and run events (posthog.com/docs/libraries/node), keyed
// by user id: the same distinct id the browser identifies with. Each event
// is sent before the response (or the run step) finishes, while Cloud Run
// still allocates CPU to the request. Without a key, procedures get no
// analytics.
const key = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const posthog =
  key === undefined
    ? undefined
    : new PostHog(key, { host: ENV.NEXT_PUBLIC_POSTHOG_HOST });
// The same property the browser adds to its events (src/lib/analytics-client.ts).
const site = new URL(ENV.BETTER_AUTH_URL).hostname;
const environment = analyticsEnvironment(site);

/**
 * Sends a server error to PostHog Error Tracking as a `$exception` event
 * (posthog.com/docs/error-tracking/installation/node), keyed by the
 * merchant's user id when known; without one, PostHog sends it anonymously.
 * The returned promise settles once the event is sent.
 *
 * The error tracking drain (src/lib/error-tracking.ts) is its one caller:
 * every server error reaches it as an error-level evlog wide event. `site`
 * tells dev.wovain.com from a laptop, both "development".
 */
export const captureServerException = async (
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>
): Promise<void> => {
  if (posthog === undefined) {
    return;
  }
  try {
    await posthog.captureExceptionImmediate(error, distinctId, {
      ...properties,
      environment,
      site,
    });
  } catch {
    // PostHog is unreachable: the error's wide event is still in Cloud
    // Logging. Logging this failure would loop through the same drain.
  }
};

export const analytics: Context["analytics"] = posthog && {
  // Awaited by its callers, so the event leaves before the response: on
  // Cloud Run (request-based billing) CPU is throttled once the response is
  // sent, and events queued in after() were starved and lost.
  capture: async ({ properties, ...event }) => {
    try {
      await posthog.captureImmediate({
        ...event,
        properties: { ...properties, environment },
      });
    } catch (error) {
      // Analytics never fails the merchant's request.
      log.warn({ analytics: { event: event.event, failed: String(error) } });
    }
  },
  identify: (person) => {
    after(() => posthog.identifyImmediate(person));
  },
};
