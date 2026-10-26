"use client";

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Sends a signed-in merchant to the dashboard. On the sign-in error page, a
 * merchant who already has a session (a Google sign-in refused while signed
 * in with a password) has nothing to fix there.
 */
export const SignedInRedirect = () => {
  const router = useRouter();
  const { data } = authClient.useSession();
  const signedIn = data?.user !== undefined;
  useEffect(() => {
    if (signedIn) {
      router.replace("/dashboard");
    }
  }, [router, signedIn]);
  return null;
};
