"use client";

import type { ChartConfig } from "@wovain/ui/components/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wovain/ui/components/chart";
import { FramePanel } from "@wovain/ui/components/reui/frame";
import { useFormatter, useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { Insights } from "@/lib/flow-client";

type Point = Extract<Insights["shop"], { status: "ok" }>["series"][number];

/**
 * Revenue and profit over the period: dashboard-01's interactive area chart
 * on Recharts, recoloured to wovain's roles. Plum ink carries revenue; the
 * one cochineal dye marks profit, the number the merchant acts on.
 */
export const SalesChart = ({
  series,
  totals,
}: {
  series: Point[];
  totals: { profit: string; revenue: string };
}) => {
  const t = useTranslations("Insights.shop");
  const format = useFormatter();
  const config = {
    profit: { color: "var(--primary)", label: t("profit") },
    revenue: { color: "var(--foreground)", label: t("revenue") },
  } satisfies ChartConfig;
  const day = (value: string) =>
    format.dateTime(new Date(value), { day: "numeric", month: "short" });

  return (
    <FramePanel>
      <figure>
        <figcaption className="mb-3 text-sm font-medium">
          {t("chartTitle")}
          <span className="sr-only"> {t("chartLabel", totals)}</span>
        </figcaption>
        <ChartContainer className="aspect-auto h-60 w-full" config={config}>
          <AreaChart data={series} margin={{ left: 4, right: 4 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="fillProfit" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-profit)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-profit)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={32}
              tickFormatter={day}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis axisLine={false} tickLine={false} width={40} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) => day(String(value))}
                />
              }
              cursor={false}
            />
            <Area
              dataKey="revenue"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              type="monotone"
            />
            <Area
              dataKey="profit"
              fill="url(#fillProfit)"
              stroke="var(--color-profit)"
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </figure>
    </FramePanel>
  );
};
