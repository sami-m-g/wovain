import PostHog from "posthog-react-native";

import { ENV } from "@/env";

// PostHog Error Tracking, the one place wovain's errors are watched
// (AGENTS.md). The app reports errors only: no lifecycle or screen events.
// Events stay in memory (no extra native storage module), so each one is
// sent right away (flushAt 1). Without EXPO_PUBLIC_POSTHOG_KEY, reporting
// is off.
const key = ENV.EXPO_PUBLIC_POSTHOG_KEY ?? "";

const posthog = new PostHog(key, {
  captureAppLifecycleEvents: false,
  disabled: key === "",
  errorTracking: {
    autocapture: { uncaughtExceptions: true, unhandledRejections: true },
  },
  flushAt: 1,
  host: ENV.EXPO_PUBLIC_POSTHOG_HOST,
  persistence: "memory",
});

// Sends a caught error to Error Tracking, with where it happened.
export const reportError = (error: unknown, where: string) => {
  posthog.captureException(error, { where });
};

// Ties reports to the signed-in merchant, and forgets them on sign-out.
export const identify = (userId?: string) => {
  if (userId === undefined) {
    posthog.reset();
    return;
  }
  posthog.identify(userId);
};
