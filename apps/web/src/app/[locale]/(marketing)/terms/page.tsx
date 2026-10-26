import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "termsDescription",
    locale,
    path: "/terms",
    titleKey: "termsTitle",
  });
};

const TermsPage = async ({ params }: PageProps<"/[locale]/terms">) => {
  await enterLocale(params);
  return <LegalPage doc="terms" />;
};

export default TermsPage;
