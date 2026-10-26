import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ConnectionsPanel } from "@/components/app/connections-panel";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/connections">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/connections",
    titleKey: "connectionsTitle",
  });
};

const ConnectionsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/connections">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/connections");
  const t = await getTranslations("Connections");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
      </div>
      <ConnectionsPanel />
    </div>
  );
};

export default ConnectionsPage;
