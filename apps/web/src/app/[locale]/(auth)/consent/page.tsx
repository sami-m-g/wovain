import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ConsentPanel } from "@/components/auth/consent-panel";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/consent">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    index: false,
    locale,
    path: "/consent",
    titleKey: "consentTitle",
  });
};

// Better Auth's consentPage ("/consent"): the proxy serves it in the visitor's locale.
const ConsentPage = async ({ params }: PageProps<"/[locale]/consent">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return (
    <Suspense>
      <ConsentPanel />
    </Suspense>
  );
};

export default ConsentPage;
