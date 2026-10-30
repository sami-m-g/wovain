import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RunsTable } from "@/components/app/runs-list";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/drops">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/drops",
    titleKey: "dropsTitle",
  });
};

// Every drop wovain made for the merchant, newest first. A drop is one run
// of the flow (brief, ideas, designs, products, campaign); "run" stays an
// internal word (the run table, the workflow), never shown.
const DropsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/drops">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/drops");
  const t = await getTranslations("Runs");
  const showModels = await core.flags.isOn("model-routing", {
    userId: session.user.id,
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("lead")}</p>
      </div>
      <RunsTable showModels={showModels} />
    </div>
  );
};

export default DropsPage;
