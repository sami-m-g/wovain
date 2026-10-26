import { posthog } from "posthog-js";

import { consentRequired } from "@/lib/consent";

// The banner's state for useSyncExternalStore. PostHog persists the choice;
// this only tells subscribers (the banner, the dashboard's AnalyticsIdentity)
// when it changed or when "Cookie settings" reopened the banner.
const listeners = new Set<() => void>();
let reopened = false;

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeConsent = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether to show the banner: asked to, or no choice yet where it's needed. */
export const consentBannerOpen = () => {
  // Without a PostHog key nothing is collected, so there is nothing to ask.
  if (!posthog.__loaded) {
    return false;
  }
  return (
    reopened ||
    (consentRequired() && posthog.get_explicit_consent_status() === "pending")
  );
};

export const consentBannerOpenOnServer = () => false;
export const openConsentSettings = () => {
  reopened = true;
  notify();
};

export const acceptAnalytics = () => {
  posthog.opt_in_capturing();
  reopened = false;
  notify();
};

export const rejectAnalytics = () => {
  posthog.opt_out_capturing();
  reopened = false;
  notify();
};

/**
 * posthog.reset() for sign-out, keeping the visitor's consent: reset() clears
 * it, which would bring the banner back and stop capturing.
 */
export const resetAnalytics = () => {
  const consent = posthog.get_explicit_consent_status();
  posthog.reset();
  if (consent === "granted") {
    posthog.opt_in_capturing({ captureEventName: false });
  } else if (consent === "denied") {
    posthog.opt_out_capturing();
  }
};
