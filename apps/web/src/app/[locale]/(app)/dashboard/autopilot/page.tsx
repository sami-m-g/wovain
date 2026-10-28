import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AutopilotLog } from "@/components/app/autopilot-log";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/autopilot">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/autopilot",
    titleKey: "autopilotTitle",
  });
};

// The decision log comes from packages/api (autopilot.log), behind the
// autopilot-triggers flag; the page only lays it out.
const AutopilotPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/autopilot">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/autopilot");
  const t = await getTranslations("Autopilot");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("lead")}</p>
      </div>
      <AutopilotLog />
    </div>
  );
};

export default AutopilotPage;
