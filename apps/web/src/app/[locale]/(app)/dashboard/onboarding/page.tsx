import type { Metadata } from "next";
import { Suspense } from "react";

import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/onboarding">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/onboarding",
    titleKey: "onboardingTitle",
  });
};

const OnboardingPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/onboarding">) => {
  const locale = await enterLocale(params);
  await requireSession(locale, "/dashboard/onboarding");

  // The wizard reads ?step itself, so it moves between steps without a
  // server round trip, and a provider's consent page comes back to it.
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
};

export default OnboardingPage;
