import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ENV } from "@/env.server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

export const siteUrl = new URL(ENV.BETTER_AUTH_URL);

/** The MCP endpoint ChatGPT connects to (MCP_URL in production). */
export const mcpUrl = ENV.MCP_URL ?? new URL("/api/mcp", siteUrl).toString();

/** Absolute URL of a path in a locale (the default locale has no prefix). */
export const localizedUrl = (path: string, locale: Locale) =>
  new URL(getPathname({ href: path, locale }), siteUrl).toString();

/** Canonical URL plus hreflang alternates (and x-default) for one path. */
export const alternatesFor = (
  path: string,
  locale: Locale
): Metadata["alternates"] => {
  const languages: Record<string, string> = {};
  for (const item of routing.locales) {
    languages[item] = localizedUrl(path, item);
  }
  languages["x-default"] = localizedUrl(path, routing.defaultLocale);
  return { canonical: localizedUrl(path, locale), languages };
};

type MetadataKey = Parameters<
  Awaited<ReturnType<typeof getTranslations<"Metadata">>>
>[0];

/** Localized title, description, canonical and hreflang for one page. */
export const pageMetadata = async ({
  locale,
  path,
  titleKey,
  descriptionKey,
  index = true,
}: {
  locale: Locale;
  path: string;
  titleKey: MetadataKey;
  descriptionKey?: MetadataKey;
  index?: boolean;
}): Promise<Metadata> => {
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const description = t(descriptionKey ?? "defaultDescription");
  return {
    alternates: alternatesFor(path, locale),
    description,
    openGraph: {
      description,
      locale,
      title: t(titleKey),
      url: localizedUrl(path, locale),
    },
    robots: index ? undefined : { follow: false, index: false },
    title: t(titleKey),
  };
};

/** Metadata for a page whose title and description come from content, not messages. */
export const contentMetadata = ({
  locale,
  path,
  title,
  description,
  type = "website",
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  type?: "website" | "article";
}): Metadata => ({
  alternates: alternatesFor(path, locale),
  description,
  openGraph: {
    description,
    locale,
    title,
    type,
    url: localizedUrl(path, locale),
  },
  title,
});

/** BreadcrumbList structured data from (name, path) pairs. */
export const breadcrumbJsonLd = (
  items: { name: string; path: string }[],
  locale: Locale
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    item: localizedUrl(item.path, locale),
    name: item.name,
    position: index + 1,
  })),
});
