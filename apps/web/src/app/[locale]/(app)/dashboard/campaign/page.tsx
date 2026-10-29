import type { Metadata } from "next";

import { CampaignOverview } from "@/components/onboarding/campaign-overview";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/campaign">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/campaign",
    titleKey: "campaignTitle",
  });
};

const RUN_ID = /^[\w-]{1,64}$/u;

// "Here's your campaign": the end of the guided flow, for one run.
const CampaignPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/campaign">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/campaign");
  const { run } = await searchParams;
  if (typeof run !== "string" || !RUN_ID.test(run)) {
    return redirect({ href: "/dashboard/runs", locale });
  }
  return <CampaignOverview runId={run} />;
};

export default CampaignPage;
