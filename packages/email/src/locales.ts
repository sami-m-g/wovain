// The languages wovain speaks, on the site and in its emails. Add one here
// (with its messages/<locale>.json and email copy).
export const locales = ["en", "fr", "es"] as const;
export type Locale = (typeof locales)[number];
