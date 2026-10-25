import { headers } from "next/headers";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/services";

/** The signed-in session, or a redirect to sign in that comes back to `next`. */
export const requireSession = async (locale: Locale, next: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return redirect({
      href: { pathname: "/login", query: { next } },
      locale,
    });
  }
  return session;
};
