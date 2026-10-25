import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { ogImage } from "@/lib/og";

export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

const metadataFor = (locale: string) =>
  getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "Metadata",
  });

export const generateImageMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => {
  const { locale } = await params;
  const t = await metadataFor(locale);
  return [{ alt: t("ogAlt"), contentType, id: "og", size }];
};

const OpengraphImage = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => {
  const { locale } = await params;
  const t = await metadataFor(locale);
  return ogImage({
    subtitle: t("ogSteps"),
    title: t("ogTagline"),
  });
};

export default OpengraphImage;
