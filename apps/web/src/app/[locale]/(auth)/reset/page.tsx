import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ResetForm } from "@/components/auth/reset-form";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/reset">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    descriptionKey: "resetDescription",
    index: false,
    locale,
    path: "/reset",
    titleKey: "resetTitle",
  });
};

const ResetPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/reset">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;
  return <ResetForm invalid={query.error !== undefined} token={token} />;
};

export default ResetPage;
