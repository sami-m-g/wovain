import { defineRouting } from "next-intl/routing";

/** Add a language here (and its messages/<locale>.json); nothing else changes. */
const locales = ["en", "fr", "es"] as const;

export const routing = defineRouting({
  defaultLocale: "en",
  localePrefix: "as-needed",
  locales,
});

export type Locale = (typeof locales)[number];
