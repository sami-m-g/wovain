import { Button } from "@wovain/ui/components/button";
import { log } from "evlog";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ConnectionsSummary } from "@/components/app/connections-panel";
import { WarmDirections } from "@/components/app/drop-directions";
import { RecentRuns } from "@/components/app/runs-list";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { client } from "@/utils/orpc";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard",
    titleKey: "dashboardTitle",
  });
};

const RUN_ID = /^[\w-]{1,64}$/u;

// The overview still shows when the check fails; the failure is logged.
const onboardingOpen = async () => {
  try {
    const status = await client.onboarding.status();
    return status.enabled && !status.finished;
  } catch (error) {
    log.error({
      error: "ONBOARDING_STATUS_FAILED",
      reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const DashboardPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard">) => {
  const locale = await enterLocale(params);
  const { run } = await searchParams;
  // Run emails link to /dashboard?run=<id>: open that run in the flow.
  if (typeof run === "string" && RUN_ID.test(run)) {
    redirect({
      href: { pathname: "/dashboard/new", query: { run } },
      locale,
    });
  }
  const session = await requireSession(locale, "/dashboard");
  // With the onboarding-wizard flag on, a merchant starts in the wizard (after
  // sign-up and sign-in both land here) until they reach its last step.
  if (await onboardingOpen()) {
    redirect({ href: "/dashboard/onboarding", locale });
  }
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-10">
      {/* Finds the new-drop suggestions in the background. */}
      <WarmDirections />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("greeting", { name: session.user.name })}
          </h1>
          <p className="text-muted-foreground mt-2">{t("lead")}</p>
        </div>
        <Button
          className="h-9 w-fit px-4"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t("newDrop")}
        </Button>
      </div>
      <SetupChecklist />
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="recent-runs">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2
              className="font-display text-lg font-semibold tracking-[-0.015em]"
              id="recent-runs"
            >
              {t("recentRuns")}
            </h2>
            <Link
              className="text-accent-text text-sm font-medium hover:underline"
              href="/dashboard/runs"
            >
              {t("allRuns")}
            </Link>
          </div>
          <RecentRuns limit={3} />
        </section>
        <section aria-labelledby="connections-summary">
          <h2
            className="font-display mb-4 text-lg font-semibold tracking-[-0.015em]"
            id="connections-summary"
          >
            {t("connections")}
          </h2>
          <ConnectionsSummary />
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
