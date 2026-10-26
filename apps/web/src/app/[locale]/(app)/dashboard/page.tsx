import { Button } from "@wovain/ui/components/button";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ConnectionsSummary } from "@/components/app/connections-panel";
import { RunsList } from "@/components/app/runs-list";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

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
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("greeting", { name: session.user.name })}
          </h1>
          <p className="text-muted-foreground mt-2">{t("lead")}</p>
        </div>
        <Button
          className="h-9 w-fit rounded-lg px-4"
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
              className="text-primary text-sm font-medium underline"
              href="/dashboard/runs"
            >
              {t("allRuns")}
            </Link>
          </div>
          <RunsList headingLevel={3} limit={3} />
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
