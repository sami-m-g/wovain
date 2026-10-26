"use client";

import { useLocale } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { authLocaleFor } from "@/lib/auth-locale";

const DASHBOARD = "/dashboard";
// A new merchant starts onboarding here, as Google's newUserCallbackURL
// does (lib/auth-client-plugin.ts).
const NEW_MERCHANT = "/dashboard/connections";
const SIGN_UP_PATH = /\/sign-up\/?$/u;

/** Only same-app paths are allowed as a post-login destination. */
const safeDestination = (value: string) =>
  value.startsWith(DASHBOARD) ? value : DASHBOARD;

const searchParams = () => new URLSearchParams(window.location.search);

/**
 * Whether `to` is Better Auth UI's post-sign-in destination: the URL's
 * ?redirectTo, or the dashboard.
 */
const isDestination = (to: string) =>
  to === DASHBOARD || to === searchParams().get("redirectTo")?.trim();

// ChatGPT (or another OAuth client) is signing in: Better Auth follows the
// signed query back to the authorization, so the form must not navigate on
// its own.
const inOAuthFlow = () => {
  const query = searchParams();
  return query.has("sig") || query.has("oauth_query");
};

const destinationAfterAuth = (to: string) =>
  SIGN_UP_PATH.test(window.location.pathname)
    ? NEW_MERCHANT
    : safeDestination(to);

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
      // Sign-up shows "check your email" (verify-email) instead of signing in;
      // the server requires a verified email for password sign-in.
      emailAndPassword={{
        forgotPassword: true,
        minPasswordLength: 8,
        requireEmailVerification: true,
      }}
      locale={authLocaleFor(locale)}
      navigate={({ replace, to }) => {
        const arriving = isDestination(to);
        if (arriving && inOAuthFlow()) {
          return;
        }
        const target = arriving ? destinationAfterAuth(to) : to;
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
