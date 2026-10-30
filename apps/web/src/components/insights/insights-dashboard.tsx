"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Badge } from "@wovain/ui/components/badge";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import { cn } from "@wovain/ui/lib/utils";
import { CircleAlert, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ConnectState } from "@/components/app/connect-state";
import type { DataColumn } from "@/components/app/data-table";
import { DataTable } from "@/components/app/data-table";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { ShuttleLoader } from "@/components/brand/shuttle-mark";
import { KpiFrame } from "@/components/insights/kpi-cards";
import { SalesChart } from "@/components/insights/sales-chart";
import { WhatWeLearned } from "@/components/insights/what-we-learned";
import { Link } from "@/i18n/navigation";
import type { InsightRange, Insights } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const RANGES = ["7d", "28d", "90d"] as const satisfies readonly InsightRange[];
const DASH = "–";

type Shop = Extract<Insights["shop"], { status: "ok" }>;
type Ads = Extract<Insights["ads"], { status: "ok" }>;
type ProductRow = Shop["products"][number];
type CampaignRow = Ads["campaigns"][number];
type DropRow = Insights["drops"][number];

const unknown = (value: number | undefined, show: (n: number) => string) =>
  value === undefined ? DASH : show(value);

/** Formatters for the dashboard's figures, in the merchant's locale. */
const useFigures = () => {
  const format = useFormatter();
  return {
    count: (value: number) => format.number(value),
    money: (value: number | undefined) =>
      unknown(value, (n) =>
        format.number(n, { currency: "USD", style: "currency" })
      ),
    percent: (value: number | undefined) =>
      unknown(value, (n) =>
        format.number(n / 100, {
          maximumFractionDigits: 1,
          style: "percent",
        })
      ),
    ratio: (value: number | undefined) =>
      unknown(
        value,
        (n) => `${format.number(n, { maximumFractionDigits: 2 })}×`
      ),
    score: (value: number | undefined) =>
      unknown(value, (n) => format.number(Math.round(n))),
  };
};

const right = {
  cellClassName: "text-end figures",
  headerClassName: "text-end",
};

const QuietEmpty = ({ title, body }: { title: string; body: string }) => (
  <Empty className="border-input border border-dashed py-8">
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{body}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const Unavailable = ({ children }: { children: ReactNode }) => (
  <Alert>
    <CircleAlert aria-hidden="true" />
    <AlertDescription className="text-foreground text-sm">
      {children}
    </AlertDescription>
  </Alert>
);

const useProductColumns = () => {
  const t = useTranslations("Insights.shop");
  const figures = useFigures();
  return useMemo<DataColumn<ProductRow>[]>(
    () => [
      { accessorKey: "name", header: t("product") },
      {
        accessorKey: "unitsSold",
        cell: ({ row }) => figures.count(row.original.unitsSold),
        header: t("units"),
        meta: right,
      },
      {
        accessorKey: "revenue",
        cell: ({ row }) => figures.money(row.original.revenue),
        header: t("revenue"),
        meta: right,
      },
      {
        accessorKey: "profit",
        cell: ({ row }) => figures.money(row.original.profit),
        header: t("profit"),
        meta: right,
      },
      {
        accessorKey: "margin",
        cell: ({ row }) => figures.percent(row.original.margin),
        header: t("margin"),
        meta: right,
      },
    ],
    [figures, t]
  );
};

export const JourneySection = ({
  journey,
}: {
  journey: Insights["journey"];
}) => {
  const t = useTranslations("Insights.journey");
  const minutes = (value: number | undefined) =>
    unknown(value, (n) => t("minutes", { value: Math.round(n) }));
  return (
    <KpiFrame
      kpis={[
        {
          hint: t("liveCampaignHint", {
            target: journey.targets.timeToLiveCampaign,
          }),
          label: t("liveCampaign"),
          value: minutes(journey.timeToLiveCampaignMinutes),
        },
        {
          hint: t("metaReviewHint"),
          label: t("metaReview"),
          value: minutes(journey.metaReviewMinutes),
        },
        {
          hint: t("firstProfitHint", {
            target: journey.targets.timeToFirstProfit,
          }),
          label: t("firstProfit"),
          value: minutes(journey.timeToFirstProfitMinutes),
        },
      ]}
      source={t("source")}
      title={t("title")}
    />
  );
};

const ShopSection = ({ shop }: { shop: Insights["shop"] }) => {
  const t = useTranslations("Insights.shop");
  const figures = useFigures();
  const columns = useProductColumns();

  if (shop.status === "not_connected") {
    return (
      <section aria-label={t("title")}>
        <ConnectState
          body={t("notConnected")}
          provider="fourthwall"
          title={t("notConnectedTitle")}
        />
      </section>
    );
  }
  if (shop.status === "unavailable") {
    return (
      <Unavailable>{t("unavailable", { message: shop.message })}</Unavailable>
    );
  }
  const totals = {
    profit: figures.money(shop.totals.profit),
    revenue: figures.money(shop.totals.revenue),
  };
  const hasSales = shop.series.some((point) => point.revenue > 0);
  return (
    <KpiFrame
      kpis={[
        { label: t("revenue"), value: totals.revenue },
        { label: t("profit"), value: totals.profit },
        { label: t("orders"), value: figures.count(shop.totals.orders) },
      ]}
      source={t("source")}
      title={t("title")}
    >
      {hasSales ? (
        <>
          <SalesChart series={shop.series} totals={totals} />
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-sm font-medium">{t("products")}</h3>
            <DataTable
              columns={columns}
              data={shop.products}
              rowId={(row) => row.name}
            />
          </div>
        </>
      ) : (
        <QuietEmpty body={t("empty")} title={t("emptyTitle")} />
      )}
    </KpiFrame>
  );
};

const useCampaignColumns = () => {
  const t = useTranslations("Insights.ads");
  const figures = useFigures();
  return useMemo<DataColumn<CampaignRow>[]>(
    () => [
      { accessorKey: "name", header: t("campaign") },
      {
        accessorKey: "spend",
        cell: ({ row }) => figures.money(row.original.spend),
        header: t("spend"),
        meta: right,
      },
      {
        accessorKey: "results",
        cell: ({ row }) => figures.count(row.original.results),
        header: t("results"),
        meta: right,
      },
      {
        accessorKey: "ctr",
        cell: ({ row }) => figures.percent(row.original.ctr),
        header: t("ctr"),
        meta: right,
      },
      {
        accessorKey: "cpa",
        cell: ({ row }) => figures.money(row.original.cpa),
        header: t("cpa"),
        meta: right,
      },
      {
        accessorKey: "roas",
        cell: ({ row }) => figures.ratio(row.original.roas),
        header: t("roas"),
        meta: right,
      },
    ],
    [figures, t]
  );
};

const AdsSection = ({ ads }: { ads: Insights["ads"] }) => {
  const t = useTranslations("Insights.ads");
  const figures = useFigures();
  const columns = useCampaignColumns();

  if (ads.status === "not_connected") {
    return (
      <section aria-label={t("title")}>
        <ConnectState
          body={t("notConnected")}
          provider="meta"
          title={t("notConnectedTitle")}
        />
      </section>
    );
  }
  if (ads.status === "unavailable") {
    return (
      <Unavailable>{t("unavailable", { message: ads.message })}</Unavailable>
    );
  }
  return (
    <KpiFrame
      kpis={[
        { label: t("spend"), value: figures.money(ads.totals.spend) },
        { label: t("roas"), value: figures.ratio(ads.totals.roas) },
        { label: t("ctr"), value: figures.percent(ads.totals.ctr) },
        { label: t("cpa"), value: figures.money(ads.totals.cpa) },
      ]}
      source={t("source")}
      title={t("title")}
    >
      {ads.campaigns.length > 0 ? (
        <DataTable
          columns={columns}
          data={ads.campaigns}
          rowId={(row) => row.id}
        />
      ) : (
        <QuietEmpty body={t("empty")} title={t("emptyTitle")} />
      )}
    </KpiFrame>
  );
};

const useDropColumns = () => {
  const t = useTranslations("Insights.drops");
  const status = useTranslations("Status");
  const figures = useFigures();
  return useMemo<DataColumn<DropRow>[]>(
    () => [
      {
        accessorKey: "seed",
        cell: ({ row }) => (
          <Link
            className="line-clamp-2 min-w-48 font-medium whitespace-normal hover:underline"
            href={{
              pathname: "/dashboard/new",
              query: { run: row.original.id },
            }}
          >
            {row.original.seed}
          </Link>
        ),
        header: t("drop"),
      },
      {
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant="outline">{status(row.original.status)}</Badge>
        ),
        header: t("status"),
      },
      {
        accessorKey: "designScore",
        cell: ({ row }) => figures.score(row.original.designScore),
        header: t("designScore"),
        meta: right,
      },
      {
        accessorKey: "adScore",
        cell: ({ row }) =>
          row.original.adScore === undefined ? (
            <span className="text-muted-foreground">{t("notScored")}</span>
          ) : (
            figures.score(row.original.adScore)
          ),
        header: t("adScore"),
        meta: right,
      },
      {
        accessorKey: "unitsSold",
        cell: ({ row }) => figures.count(row.original.unitsSold),
        header: t("units"),
        meta: right,
      },
      {
        accessorKey: "revenue",
        cell: ({ row }) => figures.money(row.original.revenue),
        header: t("revenue"),
        meta: right,
      },
      {
        accessorKey: "spend",
        cell: ({ row }) => figures.money(row.original.spend),
        header: t("spend"),
        meta: right,
      },
    ],
    [figures, status, t]
  );
};

const DropsSection = ({
  drops,
  scoring,
}: {
  drops: DropRow[];
  scoring: Insights["scoring"];
}) => {
  const t = useTranslations("Insights.drops");
  const columns = useDropColumns();

  return (
    <section aria-labelledby="insights-drops" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          className="font-display text-lg font-semibold tracking-[-0.015em]"
          id="insights-drops"
        >
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("lead")}</p>
      </div>
      {scoring.ads === "pending" && drops.length > 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Sparkles aria-hidden="true" className="size-3.5" />
          {t("scorePending")}
        </p>
      ) : null}
      {drops.length > 0 ? (
        <DataTable columns={columns} data={drops} rowId={(row) => row.id} />
      ) : (
        <Empty className="border-input border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("empty")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              className={cn(buttonVariants(), "h-9 px-4")}
              href="/dashboard/new"
            >
              {t("emptyCta")}
            </Link>
          </EmptyContent>
        </Empty>
      )}
    </section>
  );
};

const DashboardSkeleton = () => (
  <div aria-busy="true" className="flex flex-col gap-6">
    <Skeleton className="h-64 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
);

/**
 * The merchant's KPI dashboard: shop sales, ad results and quality per drop
 * for a period. Each source fails or stays empty on its own.
 */
export const InsightsDashboard = ({
  learning = false,
}: {
  // The feedback-loop flag: shows "What we learned".
  learning?: boolean;
}) => {
  const t = useTranslations("Insights");
  const [range, setRange] = useState<InsightRange>("28d");
  const { data, error, isFetching, isPending } = useQuery(
    orpc.insights.overview.queryOptions({
      input: { range },
      placeholderData: keepPreviousData,
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isPending ? (
            <ShuttleLoader label={t("updating")} />
          ) : null}
          <ToggleGroup
            aria-label={t("rangeLabel")}
            onValueChange={(value) => {
              const [next] = value;
              if (RANGES.includes(next as InsightRange)) {
                setRange(next as InsightRange);
              }
            }}
            value={[range]}
            variant="outline"
          >
            {RANGES.map((item) => (
              <ToggleGroupItem
                className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-9 px-3"
                key={item}
                value={item}
              >
                {t(`range.${item}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {isPending ? <DashboardSkeleton /> : null}
      {error ? <FlowProblemNotice problem={describeProblem(error)} /> : null}
      {data ? (
        <motion.div
          animate={{ opacity: isFetching ? 0.6 : 1 }}
          className="flex flex-col gap-8"
          initial={false}
        >
          <JourneySection journey={data.journey} />
          <ShopSection shop={data.shop} />
          <AdsSection ads={data.ads} />
          <DropsSection drops={data.drops} scoring={data.scoring} />
        </motion.div>
      ) : null}
      {learning ? <WhatWeLearned /> : null}
    </div>
  );
};
