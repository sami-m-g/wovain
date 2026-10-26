import { locales } from "@wovain/email/locales";
import { defineRouting } from "next-intl/routing";

// The locale list lives in @wovain/email/locales, shared with the emails.
export const routing = defineRouting({
  defaultLocale: "en",
  localePrefix: "as-needed",
  locales,
});

// Registered on next-intl's AppConfig (src/global.d.ts).
export type { Locale } from "next-intl";
