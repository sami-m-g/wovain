import { posthog } from "posthog-js";

/**
 * Analytics know a merchant by user id only, never the email, so server-side
 * funnel steps (sign_up from packages/auth, the rest from packages/api) join
 * this browser's visit. PostHog runs cookieless (instrumentation-client.ts)
 * and keeps the identity in memory only, so every page load of a signed-in
 * merchant identifies again; calls within one page load are skipped.
 */
export const identifyMerchant = (userId: string) => {
  if (posthog.get_distinct_id() !== userId) {
    posthog.identify(userId);
  }
};
