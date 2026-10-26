import type { BetterAuthClientPlugin } from "better-auth";
import { hasLocale } from "next-intl";

import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import { identifyMerchant } from "@/lib/analytics-client";
import { resetAnalytics } from "@/lib/consent-store";

// Better Auth's request fields that name a page on this site to return to.
const CALLBACK_FIELDS = [
  "callbackURL",
  "errorCallbackURL",
  "newUserCallbackURL",
  "redirectTo",
] as const;
// Where Google sends a merchant back when sign-in fails (the Better Auth UI
// error view reads ?error) and after a first sign-in (the connections page
// is the first step of onboarding).
const SOCIAL_ERROR_PATH = "/auth-error";
const NEW_MERCHANT_PATH = "/dashboard/connections";
// Endpoints that answer with the signed-in user, and those that end a session.
const SIGN_IN_ENDPOINTS = ["/sign-in/email", "/sign-up/email"];
const SIGN_OUT_ENDPOINTS = ["/sign-out", "/revoke-sessions"];
const SEGMENT_END = /[/?#]/u;

const endpointOf = (url: string | URL) =>
  new URL(url, "http://localhost").pathname;

const matches = (url: string | URL, endpoints: readonly string[]) => {
  const endpoint = endpointOf(url);
  return endpoints.some((path) => endpoint.endsWith(path));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pageLocale = (): Locale => {
  const { lang } = document.documentElement;
  return hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
};

/**
 * Adds the page's locale prefix to a same-site path, so the server sends the
 * merchant back in their language. Absolute URLs are left alone for the
 * server's trusted-origin check.
 */
const localize = (path: string, locale: Locale) => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  const [first] = path.slice(1).split(SEGMENT_END, 1);
  if (hasLocale(routing.locales, first)) {
    return path;
  }
  return getPathname({ href: path, locale });
};

/**
 * wovain's behavior around every auth request, whichever screen sends it
 * (the Better Auth UI views and settings, or the account menu):
 *
 * - Callback URLs carry the page's locale, and Google sign-in returns to the
 *   error view on failure and to onboarding for a new merchant.
 * - A sign-in or sign-up identifies the merchant to PostHog, so this
 *   browser's visit joins the server's sign_up event, also when an OAuth
 *   client (ChatGPT) takes over and the dashboard never loads.
 * - Every sign-out resets PostHog, so the next visitor on this browser is
 *   anonymous again.
 */
export const wovainAuthClient = () =>
  ({
    fetchPlugins: [
      {
        hooks: {
          onSuccess: (context) => {
            const { url } = context.request;
            if (matches(url, SIGN_OUT_ENDPOINTS)) {
              resetAnalytics();
              return;
            }
            if (!matches(url, SIGN_IN_ENDPOINTS)) {
              return;
            }
            const { data } = context;
            const user = isRecord(data) ? data.user : undefined;
            if (isRecord(user) && typeof user.id === "string") {
              identifyMerchant(user.id);
            }
          },
        },
        id: "wovain-auth",
        init: (url, options) => {
          const body = options?.body;
          if (!isRecord(body)) {
            return { options, url };
          }
          const next: Record<string, unknown> = { ...body };
          if (matches(url, ["/sign-in/social"])) {
            next.errorCallbackURL ??= SOCIAL_ERROR_PATH;
            next.newUserCallbackURL ??= NEW_MERCHANT_PATH;
          }
          const locale = pageLocale();
          for (const field of CALLBACK_FIELDS) {
            const value = next[field];
            if (typeof value === "string") {
              next[field] = localize(value, locale);
            }
          }
          return { options: { ...options, body: next }, url };
        },
        name: "wovain-auth",
      },
    ],
    id: "wovain-auth",
  }) satisfies BetterAuthClientPlugin;
