import { Button } from "@wovain/ui/components/button";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ConnectionsSummary } from "@/components/app/connections-panel";
import { RunsList } from "@/components/app/runs-list";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard",
    titleKey: "dashboardTitle",
  });
};

const DashboardPage = async ({ params }: PageProps<"/[locale]/dashboard">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const session = await requireSession(locale, "/dashboard");
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-expanded text-3xl leading-[1.05] font-black tracking-tight sm:text-5xl">
            {t("greeting", { name: session.user.name })}
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">{t("lead")}</p>
        </div>
        <Button
          className="h-11 w-fit px-5 text-sm font-semibold"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t("newDrop")}
        </Button>
      </div>
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="recent-runs">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2
              className="font-semi-expanded text-xl font-extrabold"
              id="recent-runs"
            >
              {t("recentRuns")}
            </h2>
            <Link
              className="text-primary text-sm font-semibold underline"
              href="/dashboard/runs"
            >
              {t("allRuns")}
            </Link>
          </div>
          <RunsList headingLevel={3} limit={3} />
        </section>
        <section aria-labelledby="connections-summary">
          <h2
            className="font-semi-expanded mb-4 text-xl font-extrabold"
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
