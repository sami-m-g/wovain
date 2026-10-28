import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DropsBoard } from "@/components/app/drops-board";
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

// Drops (openspec design-drops), behind the design-drops flag: the page
// doesn't exist while the flag is off for the merchant.
const DropsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/drops">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/drops");
  if (!(await core.flags.isOn("design-drops", { userId: session.user.id }))) {
    notFound();
  }
  const t = await getTranslations("Drops");
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">{t("intro")}</p>
      </header>
      <DropsBoard />
    </div>
  );
};

export default DropsPage;
