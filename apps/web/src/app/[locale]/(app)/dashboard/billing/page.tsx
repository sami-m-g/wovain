import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BillingPanel } from "@/components/billing/billing-panel";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/billing">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/billing",
    titleKey: "billingTitle",
  });
};

const BillingPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/billing">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/billing");
  const t = await getTranslations("Billing.page");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
      </div>
      <Suspense>
        <BillingPanel />
      </Suspense>
    </div>
  );
};

export default BillingPage;
