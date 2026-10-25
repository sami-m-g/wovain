import { hasLocale } from "next-intl";

import { getContent } from "@/content/load";
import { USE_CASE_SLUGS } from "@/content/types";
import type { UseCaseSlug } from "@/content/types";
import { routing } from "@/i18n/routing";
import { ogImage } from "@/lib/og";

export const size = { height: 630, width: 1200 };
export const contentType = "image/png";
export const alt = "wovain use case";

export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    USE_CASE_SLUGS.map((slug) => ({ locale, slug }))
  );

const Image = async ({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) => {
  const { locale: requested, slug } = await params;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  const content = await getContent(locale);
  const key = (USE_CASE_SLUGS as readonly string[]).includes(slug)
    ? (slug as UseCaseSlug)
    : "creator-merch";
  const item = content.cases[key];
  return ogImage({
    subtitle: item.lead,
    title: item.title,
  });
};

export default Image;
