"use client";

import { Skeleton } from "@wovain/ui/components/skeleton";
import { useInView } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRef } from "react";

import { KpiFrame } from "@/components/insights/kpi-cards";
import type { PriceBreakdown } from "@/lib/pricing";

/** The Insights chart loads only when its section is near, to keep the hero light. */
const SalesChart = dynamic(
  async () => {
    const { SalesChart: Chart } =
      await import("@/components/insights/sales-chart");
    return Chart;
  },
  {
    loading: () => <Skeleton className="h-[19rem] w-full rounded-xl" />,
    ssr: false,
  }
);

// Two weeks of an example drop: orders build after launch, profit tracks the price rule.
const ORDERS = [1, 0, 2, 3, 2, 4, 5, 3, 6, 5, 7, 6, 8, 9] as const;
const FIRST_DAY = Date.UTC(2026, 9, 1);
const DAY_MS = 86_400_000;

const seriesOf = ({ price, profit }: PriceBreakdown) =>
  ORDERS.map((orders, index) => ({
    date: new Date(FIRST_DAY + index * DAY_MS).toISOString(),
    orders,
    profit: Math.round(orders * profit * 100) / 100,
    revenue: orders * price,
  }));

/**
 * The app's own Insights chart, drawn with two weeks of example sales of a
 * typical tee (`tee`, priced on the server from the pricing rules).
 */
export const ExampleInsights = ({ tee }: { tee: PriceBreakdown }) => {
  const series = seriesOf(tee);
  const sums = {
    orders: series.reduce((sum, point) => sum + point.orders, 0),
    profit: series.reduce((sum, point) => sum + point.profit, 0),
    revenue: series.reduce((sum, point) => sum + point.revenue, 0),
  };
  const box = useRef<HTMLDivElement>(null);
  const near = useInView(box, { margin: "400px 0px", once: true });
  const format = useFormatter();
  const t = useTranslations("Insights.shop");
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const totals = {
    profit: money(sums.profit),
    revenue: money(sums.revenue),
  };
  return (
    <KpiFrame
      kpis={[
        { label: t("revenue"), value: totals.revenue },
        { label: t("profit"), value: totals.profit },
        { label: t("orders"), value: format.number(sums.orders) },
      ]}
      source={t("source")}
      title={t("title")}
    >
      <div className="min-h-[19rem]" ref={box}>
        {near ? (
          <SalesChart series={series} totals={totals} />
        ) : (
          <Skeleton className="h-[19rem] w-full rounded-xl" />
        )}
      </div>
    </KpiFrame>
  );
};
