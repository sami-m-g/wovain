"use client";

import { useLocale } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { authLocaleFor } from "@/lib/auth-locale";

const DASHBOARD = "/dashboard";

/** Only same-app paths are allowed as a post-login destination. */
const safeNext = (value: string | null) =>
  value?.startsWith(DASHBOARD) ? value : DASHBOARD;

// The view routes (app/[locale]/(auth)): /login, /sign-up, /reset, ...
const viewPaths = {
  auth: {
    callback: "auth-callback",
    error: "auth-error",
    forgotPassword: "forgot-password",
    redirect: "auth-redirect",
    resetLinkSent: "reset-link-sent",
    resetPassword: "reset",
    signIn: "login",
    signOut: "sign-out",
    signUp: "sign-up",
    verifyEmail: "verify-email",
  },
} as const;

// The shape Better Auth UI hands its link component.
const AuthLink = ({
  href,
  to: _to,
  ...rest
}: ComponentProps<typeof Link> & { to?: string }) => (
  <Link href={href} prefetch={false} {...rest} />
);

/**
 * Better Auth UI for the sign-in views and the account settings: our auth
 * client, router and locale; Google only when the server has its credentials
 * (`google`, read at request time by AuthSession).
 */
export const AuthProviders = ({
  children,
  google,
}: {
  children: ReactNode;
  google: boolean;
}) => {
  const router = useRouter();
  const locale = useLocale() as Locale;
  return (
    <AuthProvider
      Link={AuthLink}
      additionalFields={[
        // Saved as the merchant's language at sign-up, so emails match the site.
        {
          defaultValue: locale,
          inputType: "hidden",
          label: "locale",
          name: "locale",
          signUp: true,
          type: "string",
        },
      ]}
      authClient={authClient}
      basePaths={{ auth: "", settings: "/dashboard/settings" }}
      emailAndPassword={{ forgotPassword: true, minPasswordLength: 8 }}
      locale={authLocaleFor(locale)}
      navigate={({ replace, to }) => {
        const query = new URLSearchParams(window.location.search);
        // ChatGPT (or another OAuth client) is signing in: Better Auth follows
        // the signed query back to the authorization, so the form must not
        // navigate on its own.
        const inOAuthFlow = query.has("sig") || query.has("oauth_query");
        if (to === DASHBOARD && inOAuthFlow) {
          return;
        }
        const target = to === DASHBOARD ? safeNext(query.get("next")) : to;
        if (replace) {
          router.replace(target);
        } else {
          router.push(target);
        }
      }}
      redirectTo={DASHBOARD}
      socialProviders={google ? ["google"] : []}
      viewPaths={viewPaths}
    >
      {children}
    </AuthProvider>
  );
};
