import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ConnectionsPanel } from "@/components/app/connections-panel";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/connections">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
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
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
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
