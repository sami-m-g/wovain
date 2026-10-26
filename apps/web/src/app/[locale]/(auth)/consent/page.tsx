import type { Metadata } from "next";
import { Suspense } from "react";

import { ConsentPanel } from "@/components/consent-panel";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/consent">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/consent",
    titleKey: "consentTitle",
  });
};

// Better Auth's consentPage ("/consent"): the proxy serves it in the visitor's locale.
const ConsentPage = async ({ params }: PageProps<"/[locale]/consent">) => {
  await enterLocale(params);
  return (
    <Suspense>
      <ConsentPanel />
    </Suspense>
  );
};

export default ConsentPage;
