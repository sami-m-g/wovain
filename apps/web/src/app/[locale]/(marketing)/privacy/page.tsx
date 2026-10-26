import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "privacyDescription",
    locale,
    path: "/privacy",
    titleKey: "privacyTitle",
  });
};

const PrivacyPage = async ({ params }: PageProps<"/[locale]/privacy">) => {
  await enterLocale(params);
  return <LegalPage doc="privacy" />;
};

export default PrivacyPage;
