"use client";

import { useEffect } from "react";

import { identifyMerchant } from "@/lib/analytics-client";
import { authClient } from "@/lib/auth-client";

/**
 * Identifies the signed-in merchant to PostHog on every dashboard page load,
 * whichever way they signed in (email, Google).
 */
export const AnalyticsIdentity = () => {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (userId !== undefined) {
      identifyMerchant(userId);
    }
  }, [userId]);

  return null;
};
