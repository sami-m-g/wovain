"use client";

import { useEffect } from "react";

import { identifyMerchant } from "@/lib/analytics-client";
import { authClient } from "@/lib/auth-client";
import { subscribeConsent } from "@/lib/consent-store";

/**
 * Identifies the signed-in merchant to PostHog on every dashboard page load,
 * whichever way they signed in (email, Google), and again when they answer
 * the consent banner: accepting starts a fresh identity in PostHog.
 */
export const AnalyticsIdentity = () => {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (userId === undefined) {
      return;
    }
    identifyMerchant(userId);
    return subscribeConsent(() => {
      identifyMerchant(userId);
    });
  }, [userId]);

  return null;
};
