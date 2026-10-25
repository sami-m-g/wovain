import { hasLocale } from "next-intl";

import { getContent } from "@/content/load";
import { GUIDE_SLUGS } from "@/content/types";
import type { GuideSlug } from "@/content/types";
import { routing } from "@/i18n/routing";
import { ogImage } from "@/lib/og";

export const size = { height: 630, width: 1200 };
export const contentType = "image/png";
export const alt = "wovain guide";

export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    GUIDE_SLUGS.map((slug) => ({ locale, slug }))
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
  const key = (GUIDE_SLUGS as readonly string[]).includes(slug)
    ? (slug as GuideSlug)
    : "price-print-on-demand-merch";
  const guide = content.guides[key];
  return ogImage({
    subtitle: guide.lead,
    title: guide.title,
  });
};

export default Image;
