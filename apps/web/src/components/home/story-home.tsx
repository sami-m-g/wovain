"use client";

import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@wovain/ui/components/button";
import { Card } from "@wovain/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { posthog } from "posthog-js";
import { useEffect } from "react";

import { DropDirections } from "@/components/app/drop-directions";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { nextHref, nextStepOf } from "@/components/home/next-step";
import { KpiFrame } from "@/components/insights/kpi-cards";
import { useLaunchFacts } from "@/components/onboarding/use-launch-facts";
import { Link, useRouter } from "@/i18n/navigation";
import type { Insights, Run } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// A failure before a procedure ran is only seen here, so it goes to PostHog
// Error Tracking; a procedure that threw is already tracked on the server.
const ReportedProblem = ({ error }: { error: unknown }) => {
  useEffect(() => {
    if (!(error instanceof ORPCError)) {
      posthog.captureException(error, { feature: "story-home" });
    }
  }, [error]);
  return <FlowProblemNotice problem={describeProblem(error)} />;
};

/** The anchor of "What sells now" on the Home. */
export const SELLS_NOW_ID = "what-sells-now";
const DASH = "–";

const OPEN: ReadonlySet<Run["status"]> = new Set([
  "awaiting_approval",
  "running",
]);

/**
 * The one thing to do next, from the same facts the onboarding steps read
 * (use-launch-facts): pick what to sell, get the shop ready, Meta and the
 * spend limits, approve a design, launch the ads.
 */
export const NextAction = () => {
  const t = useTranslations("StoryHome.next");
  const runs = useQuery(orpc.runs.list.queryOptions());
  // The drop in progress, else the latest one.
  const run =
    runs.data?.find((each) => OPEN.has(each.status)) ?? runs.data?.[0];
  const { facts, problem, ready, settled, store } = useLaunchFacts(run?.id);

  // Wait for every fact, so the card never shows an earlier step first.
  if (runs.isPending || !settled) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }
  if (runs.error) {
    return <ReportedProblem error={runs.error} />;
  }
  if (problem !== undefined) {
    return <ReportedProblem error={problem} />;
  }
  // Without the onboarding steps (their flag off), what sells now leads.
  if (ready === undefined) {
    return null;
  }
  const step = nextStepOf(facts);
  const href = nextHref(step, run?.id);
  const body =
    step === "store" && store.total > 0
      ? t("store.progress", { done: store.done, total: store.total })
      : t(`${step}.body`, { brief: run?.seed ?? "" });
  const action = cn(
    buttonVariants({ variant: "default" }),
    "h-9 w-fit shrink-0 px-4"
  );

  return (
    <section aria-labelledby="next-action">
      <Card className="border-primary/30 flex flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("eyebrow")}
          </p>
          <h2
            className="font-display text-lg font-semibold tracking-[-0.015em]"
            id="next-action"
          >
            {t(`${step}.title`)}
          </h2>
          <p className="text-muted-foreground max-w-[60ch] text-sm">{body}</p>
        </div>
        {href === null ? (
          <a className={action} href={`#${SELLS_NOW_ID}`}>
            {t(`${step}.action`)}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </a>
        ) : (
          <Link className={action} href={href}>
            {t(`${step}.action`)}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        )}
      </Card>
    </section>
  );
};

/** What sells now, from Qloo: one click opens a new drop with that brief. */
export const HomeDirections = () => {
  const router = useRouter();
  return (
    <section className="scroll-mt-20" id={SELLS_NOW_ID}>
      <DropDirections
        briefBelow={false}
        disabled={false}
        heading="h2"
        onUse={(brief) => {
          router.push({ pathname: "/dashboard/new", query: { brief } });
        }}
      />
    </section>
  );
};

type ShopTotals = Extract<Insights["shop"], { status: "ok" }>["totals"];

const useMoney = () => {
  const format = useFormatter();
  return (value: number | undefined) =>
    value === undefined
      ? DASH
      : format.number(value, { currency: "USD", style: "currency" });
};

/**
 * The last 28 days from Fourthwall's reports. Before the first sale the
 * area stays, empty, with where the first sale will show.
 */
export const HomeResults = () => {
  const t = useTranslations("StoryHome.results");
  const format = useFormatter();
  const money = useMoney();
  const { data, error, isPending } = useQuery(
    orpc.insights.overview.queryOptions({ input: { range: "28d" } })
  );

  if (isPending) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (error) {
    return <ReportedProblem error={error} />;
  }
  const totals: ShopTotals | undefined =
    data.shop.status === "ok" ? data.shop.totals : undefined;
  const sold = (totals?.orders ?? 0) > 0;
  // Only a shop that answered with zero orders is a first sale to come.
  const firstSaleToCome = data.shop.status === "ok" && !sold;
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3">
      <KpiFrame
        kpis={[
          { label: t("revenue"), value: money(totals?.revenue) },
          { label: t("profit"), value: money(totals?.profit) },
          {
            label: t("orders"),
            value: totals === undefined ? DASH : format.number(totals.orders),
          },
        ]}
        source={t("source")}
        title={t("title")}
      >
        {firstSaleToCome ? (
          <Empty className="border-input border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("empty")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </KpiFrame>
      <Link
        className="text-accent-text w-fit text-sm font-medium hover:underline"
        href="/dashboard/insights"
      >
        {t("all")}
      </Link>
    </section>
  );
};
