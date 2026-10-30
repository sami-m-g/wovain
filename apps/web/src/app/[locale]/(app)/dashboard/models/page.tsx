import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ModelTrace } from "@/components/app/model-trace";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/models">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/models",
    titleKey: "modelsTitle",
  });
};

// Which Nemotron model did what in a run (packages/api models.trace).
const ModelsPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/models">) => {
  const locale = await enterLocale(params);
  const { run } = await searchParams;
  const runId = typeof run === "string" ? run : undefined;
  await requireSession(
    locale,
    runId
      ? `/dashboard/models?run=${encodeURIComponent(runId)}`
      : "/dashboard/models"
  );
  const t = await getTranslations("Models");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("lead")}</p>
      </div>
      <ModelTrace runId={runId} />
    </div>
  );
};

export default ModelsPage;
