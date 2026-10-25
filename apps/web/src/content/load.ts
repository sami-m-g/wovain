import type { Locale } from "@/i18n/routing";

import type { SiteContent } from "./types";

const loaders: Record<Locale, () => Promise<{ default: SiteContent }>> = {
  en: () => import("./en"),
  es: () => import("./es"),
  fr: () => import("./fr"),
};

/** The long-form content for one locale (server only). */
export const getContent = async (locale: Locale): Promise<SiteContent> => {
  const content = await loaders[locale]();
  return content.default;
};
