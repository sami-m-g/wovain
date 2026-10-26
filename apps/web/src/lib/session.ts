import { headers } from "next/headers";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/services";

/**
 * The signed-in session, or a redirect to sign in that comes back to `next`.
 * Better Auth UI reads `redirectTo` from the URL for both the email form and
 * the Google callback.
 */
export const requireSession = async (locale: Locale, next: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    // A fixed path on this site; the login form only follows a destination
    // that starts with /dashboard (auth-providers.tsx).
    // nosemgrep
    return redirect({
      href: { pathname: "/login", query: { redirectTo: next } },
      locale,
    });
  }
  return session;
};
