import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AlertSettingsPanel } from "@/components/app/alert-settings";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

// Settings > Alerts (openspec alerts). A static segment, so it wins over the
// account views' [path].

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings/alerts">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/settings/alerts",
    titleKey: "alertsTitle",
  });
};

const AlertsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings/alerts">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/settings/alerts");
  const t = await getTranslations("Alerts");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
      </div>
      <AlertSettingsPanel />
    </div>
  );
};

export default AlertsPage;
