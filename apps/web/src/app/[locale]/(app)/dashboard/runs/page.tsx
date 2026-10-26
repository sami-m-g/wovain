import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RunsTable } from "@/components/app/runs-list";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/runs">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/runs",
    titleKey: "runsTitle",
  });
};

const RunsPage = async ({ params }: PageProps<"/[locale]/dashboard/runs">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/runs");
  const t = await getTranslations("Runs");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("lead")}</p>
      </div>
      <RunsTable />
    </div>
  );
};

export default RunsPage;
