import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { RunsList } from "@/components/app/runs-list";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/runs">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/runs",
    titleKey: "runsTitle",
  });
};

const RunsPage = async ({ params }: PageProps<"/[locale]/dashboard/runs">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  await requireSession(locale, "/dashboard/runs");
  const t = await getTranslations("Runs");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-expanded text-3xl leading-[1.05] font-black tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">{t("lead")}</p>
      </div>
      <RunsList />
    </div>
  );
};

export default RunsPage;
