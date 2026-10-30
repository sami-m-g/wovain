import type { Metadata } from "next";
import { Suspense } from "react";

import { LaunchShell } from "@/components/onboarding/launch-shell";
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
  const session = await requireSession(locale, "/dashboard/onboarding");

  // The flow reads ?step, ?brief and ?run itself, so it moves between steps
  // without a server round trip, and a provider's consent page or the drop
  // flow comes back to it. The timer counts from sign-up.
  return (
    <Suspense>
      <LaunchShell startedAt={new Date(session.user.createdAt).toISOString()} />
    </Suspense>
  );
};

export default OnboardingPage;
