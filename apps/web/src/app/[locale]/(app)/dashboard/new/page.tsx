import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { NewDropWizard } from "@/components/app/new-drop-wizard";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

const MAX_BRIEF = 280;

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/new">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/new",
    titleKey: "newDropTitle",
  });
};

const NewDropPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/new">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { brief } = await searchParams;
  const initialBrief =
    typeof brief === "string" ? brief.slice(0, MAX_BRIEF) : "";
  const next = initialBrief
    ? `/dashboard/new?brief=${encodeURIComponent(initialBrief)}`
    : "/dashboard/new";
  await requireSession(locale, next);

  return <NewDropWizard initialBrief={initialBrief} />;
};

export default NewDropPage;
