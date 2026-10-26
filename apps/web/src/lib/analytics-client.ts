import { posthog } from "posthog-js";

/**
 * Analytics know a merchant by user id only, never the email, so server-side
 * funnel steps (sign_up from packages/auth, the rest from packages/api) join
 * this browser's visit. Until the visitor consents, PostHog is cookieless
 * (instrumentation-client.ts) and keeps the identity in memory only, and
 * accepting starts a fresh one, so every page load of a signed-in merchant,
 * and every consent answer, identifies again; repeat calls are skipped.
 */
export const identifyMerchant = (userId: string) => {
  if (posthog.get_distinct_id() !== userId) {
    posthog.identify(userId);
  }
};
