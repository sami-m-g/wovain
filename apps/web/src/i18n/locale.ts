import { hasLocale } from "next-intl";
import type { Locale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "./routing";

type LocaleParams = Promise<{ locale: string }>;

/** A configured locale, or the default one for anything else. */
export const toLocale = (value: string | undefined): Locale =>
  hasLocale(routing.locales, value) ? value : routing.defaultLocale;

/** The route's `[locale]` when it is configured; anything else is a 404. */
export const requireLocale = async (params: LocaleParams): Promise<Locale> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return locale;
};

/**
 * {@link requireLocale}, then sets it for static rendering. Layouts render
 * apart from their pages, so each layout and page calls this.
 */
export const enterLocale = async (params: LocaleParams): Promise<Locale> => {
  const locale = await requireLocale(params);
  setRequestLocale(locale);
  return locale;
};
