import { getTranslations } from "next-intl/server";

import { toLocale } from "@/i18n/locale";
import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";

const metadataFor = (locale: string) =>
  getTranslations({
    locale: toLocale(locale),
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
