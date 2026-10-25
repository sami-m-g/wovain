import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LegalPage } from "@/components/marketing/legal-page";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    descriptionKey: "privacyDescription",
    locale,
    path: "/privacy",
    titleKey: "privacyTitle",
  });
};

const PrivacyPage = async ({ params }: PageProps<"/[locale]/privacy">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <LegalPage doc="privacy" />;
};

export default PrivacyPage;
