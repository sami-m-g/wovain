"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect } from "react";

import { CampaignControls } from "@/components/app/campaign-controls";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { JourneySection } from "@/components/insights/insights-dashboard";
import { KpiFrame } from "@/components/insights/kpi-cards";
import { Link } from "@/i18n/navigation";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const CENTS = 100;
const IMAGE_SIZE = 480;
// Live numbers: the campaign's status and the KPIs refresh on their own.
const LIVE_POLL_MS = 30_000;

const useMoney = () => {
  const format = useFormatter();
  return (cents: number) =>
    format.number(cents / CENTS, { currency: "USD", style: "currency" });
};

/**
 * "Here's your campaign": everything the first drop made, in one place.
 * The run's products, the store link, the ads with their controls, the
 * spend caps and the live KPIs. Reaching it ends the first run, so the
 * overview stops sending the merchant to the guided flow.
 */
export const CampaignOverview = ({ runId }: { runId: string }) => {
  const t = useTranslations("Launch.campaign");
  const money = useMoney();
  const run = useQuery({
    ...orpc.runs.get.queryOptions({ input: { id: runId } }),
    refetchInterval: LIVE_POLL_MS,
  });
  const status = useQuery(orpc.onboarding.status.queryOptions());
  const store = useQuery({ ...orpc.store.setup.queryOptions(), retry: false });
  const insights = useQuery({
    ...orpc.insights.overview.queryOptions({ input: { range: "28d" } }),
    refetchInterval: LIVE_POLL_MS,
  });
  const { mutate: finish } = useMutation(
    orpc.onboarding.finish.mutationOptions()
  );
  const finished = status.data?.enabled === true && status.data.finished;
  useEffect(() => {
    if (status.data?.enabled === true && !finished) {
      finish({});
    }
  }, [finish, finished, status.data?.enabled]);

  if (run.isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (run.error) {
    return <FlowProblemNotice problem={describeProblem(run.error)} />;
  }

  const { campaigns, products } = run.data;
  const dailyBudget = campaigns.reduce(
    (sum, campaign) => sum + campaign.dailyBudgetCents,
    0
  );
  const autonomy =
    status.data?.enabled === true ? status.data.autonomy : undefined;
  const shopUrl = store.data?.shop.baseUrl;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[60ch]">
            {t("lead", { brief: run.data.seed })}
          </p>
        </div>
        {shopUrl ? (
          <a
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            href={shopUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("store")}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        ) : null}
      </div>

      {insights.data ? (
        <JourneySection journey={insights.data.journey} />
      ) : null}

      <KpiFrame
        kpis={[
          { label: t("spend.daily"), value: money(dailyBudget) },
          {
            label: t("spend.dailyCap"),
            value: autonomy ? money(autonomy.dailySpendCapCents) : "–",
          },
          {
            label: t("spend.monthlyCap"),
            value: autonomy ? money(autonomy.monthlySpendCapCents) : "–",
          },
        ]}
        source={t("spend.source")}
        title={t("spend.title")}
      />

      <section
        aria-labelledby="campaign-products"
        className="flex flex-col gap-4"
      >
        <h2
          className="font-display text-lg font-semibold"
          id="campaign-products"
        >
          {t("products.title")}
        </h2>
        {products.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("products.none")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      {money(Math.round(product.price * CENTS))}
                      <Badge variant="secondary">
                        {t(`products.status.${product.status}`)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {product.mockups[0] ? (
                      <Image
                        alt={t("products.mockupAlt")}
                        className="bg-muted aspect-square w-full rounded-md object-contain"
                        height={IMAGE_SIZE}
                        src={product.mockups[0]}
                        unoptimized
                        width={IMAGE_SIZE}
                      />
                    ) : null}
                    {product.productUrl ? (
                      <a
                        className="text-sm underline"
                        href={product.productUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {t("products.view")}
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="campaign-ads" className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold" id="campaign-ads">
          {t("ads.title")}
        </h2>
        {campaigns.length === 0 ? (
          <Card>
            <CardHeader>
              <CardDescription>{t("ads.none")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                className={buttonVariants()}
                href={{ pathname: "/dashboard/new", query: { run: runId } }}
              >
                {t("ads.create")}
              </Link>
            </CardContent>
          </Card>
        ) : (
          campaigns.map((campaign) => (
            <CampaignControls campaign={campaign} key={campaign.id} />
          ))
        )}
      </section>
    </div>
  );
};
