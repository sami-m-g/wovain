import { defineI18n } from "fumadocs-core/i18n";

export const i18n = defineI18n({
  defaultLanguage: "en",
  hideLocale: "default-locale",
  languages: ["en", "fr", "es"],
});

// Open Graph locales per language.
export const ogLocales: Record<string, string> = {
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
};

export const isLocale = (value: string): boolean =>
  i18n.languages.some((language) => language === value);
