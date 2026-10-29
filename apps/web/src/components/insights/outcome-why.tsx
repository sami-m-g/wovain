"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { Learned } from "@/lib/flow-client";

type OutcomeWhyItem = Learned["angles"][number];

const CENTS = 100;
// The price bands outcomes are counted in (packages/core/src/outcomes.ts).
const BANDS = ["under-25", "25-35", "35-50", "50-up"] as const;
type Band = (typeof BANDS)[number];
const isBand = (value: string): value is Band =>
  (BANDS as readonly string[]).includes(value);

/**
 * Why the merchant's own record favours (or warns against) an angle, in
 * their language: "Why this: your last 2 cottagecore drops made $84". From
 * packages/core/src/outcomes.ts (outcomeScore's `why`, or angleWhys).
 */
export const OutcomeWhy = ({ why }: { why: OutcomeWhyItem }) => {
  const t = useTranslations("Insights.learned.why");
  const format = useFormatter();
  const money = format.number(Math.abs(why.profitCents) / CENTS, {
    currency: "USD",
    style: "currency",
  });
  const { value } = why;
  const shown =
    why.kind === "price" && isBand(value) ? t(`bands.${value}`) : value;
  const up = why.direction === "up";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className="flex items-start gap-1.5 text-sm text-pretty">
      <Icon
        aria-hidden="true"
        className={
          up
            ? "text-primary mt-0.5 size-3.5 shrink-0"
            : "text-muted-foreground mt-0.5 size-3.5 shrink-0"
        }
      />
      <span>
        {t(up ? "up" : "down", {
          count: why.drops,
          kind: t(`kinds.${why.kind}`),
          money,
          value: shown,
        })}
      </span>
    </p>
  );
};
