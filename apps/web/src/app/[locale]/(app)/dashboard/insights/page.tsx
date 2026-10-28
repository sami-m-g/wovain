import type { Metadata } from "next";

import { InsightsDashboard } from "@/components/insights/insights-dashboard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/insights">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/insights",
    titleKey: "insightsTitle",
  });
};

// The data comes from packages/api (insights.overview); the page only lays it out.
const InsightsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/insights">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/insights");
  const learning = await core.flags.isOn("feedback-loop", {
    userId: session.user.id,
  });
  return <InsightsDashboard learning={learning} />;
};

export default InsightsPage;
