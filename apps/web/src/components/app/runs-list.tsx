"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Bot, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { RunStrip, stageOf } from "@/components/app/run-strip";
import { Link } from "@/i18n/navigation";
import type { Run } from "@/lib/flow-client";
import { describeProblem, flowClient } from "@/lib/flow-client";

const runsQuery = {
  queryFn: () => flowClient.runs.list(),
  queryKey: ["runs"],
} as const;

const STATUS_VARIANT: Record<
  Run["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  awaiting_approval: "default",
  completed: "secondary",
  failed: "destructive",
  running: "outline",
};

export const RunsList = ({
  limit,
  headingLevel = 2,
}: {
  limit?: number;
  headingLevel?: 2 | 3;
}) => {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const t = useTranslations("Runs");
  const status = useTranslations("Status");
  const format = useFormatter();
  const { data, error, isPending } = useQuery(runsQuery);

  if (isPending) {
    return (
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((item) => (
          <li key={item}>
            <Skeleton className="h-28 w-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }

  const runs = limit ? data.slice(0, limit) : data;

  if (runs.length === 0) {
    return (
      <div className="border-input flex flex-col items-start gap-4 border border-dashed p-8">
        <p className="text-muted-foreground">{t("empty")}</p>
        <Button
          className="h-10 px-4 text-sm font-semibold"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          {t("emptyCta")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {runs.map((run) => (
        <li
          className="border-border bg-card grid gap-4 border p-4 sm:p-5 md:grid-cols-[1fr_14rem] md:items-center"
          key={run.id}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <Badge className="w-fit" variant={STATUS_VARIANT[run.status]}>
              {status(run.status)}
            </Badge>
            <Heading className="text-base font-semibold text-pretty">
              {run.seed}
            </Heading>
            <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div>
                <dt className="sr-only">{t("mode")}</dt>
                <dd className="flex items-center gap-1.5">
                  {run.autopilot ? (
                    <Bot aria-hidden="true" className="size-4" />
                  ) : (
                    <UserRound aria-hidden="true" className="size-4" />
                  )}
                  {run.autopilot ? t("autopilot") : t("manual")}
                </dd>
              </div>
              <div>
                <dt className="sr-only">{t("started")}</dt>
                <dd>
                  <time dateTime={new Date(run.createdAt).toISOString()}>
                    {format.dateTime(new Date(run.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </dd>
              </div>
            </dl>
            {run.status === "failed" && run.error ? (
              <p className="text-destructive text-sm">
                {t("stoppedAt", { error: run.error })}
              </p>
            ) : null}
          </div>
          <RunStrip
            compact
            finished={run.status === "completed"}
            stage={stageOf(run)}
          />
        </li>
      ))}
    </ul>
  );
};
