import type { Metadata } from "next";

import { InsightsDashboard } from "@/components/insights/insights-dashboard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

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
  await requireSession(locale, "/dashboard/insights");
  return <InsightsDashboard />;
};

export default InsightsPage;
