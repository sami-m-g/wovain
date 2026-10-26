"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Bot, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { RunTape, stageOf } from "@/components/product/run-tape";
import { Link } from "@/i18n/navigation";
import type { Run } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

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
  const { data, error, isPending } = useQuery(orpc.runs.list.queryOptions());

  if (isPending) {
    return (
      <ul className="border-border bg-card divide-border flex flex-col divide-y rounded-xl border">
        {[0, 1, 2].map((item) => (
          <li className="flex flex-col gap-3 p-4 sm:p-5" key={item}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-1.5 w-full" />
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
      <div className="border-input flex flex-col items-start gap-4 rounded-xl border border-dashed p-8">
        <RunTape className="w-full max-w-xs" compact stage="brief" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
        <Button
          className="h-9 rounded-lg px-4"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          {t("emptyCta")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="border-border bg-card divide-border flex flex-col divide-y rounded-xl border">
      {runs.map((run) => (
        <li
          className="hover:bg-muted/50 grid gap-4 p-4 transition-colors sm:p-5 md:grid-cols-[1fr_14rem] md:items-center"
          key={run.id}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <Badge
              className="w-fit gap-1.5"
              variant={STATUS_VARIANT[run.status]}
            >
              {status(run.status)}
            </Badge>
            <Heading className="text-[0.95rem] font-medium text-pretty">
              <Link
                className="hover:underline"
                href={{ pathname: "/dashboard/new", query: { run: run.id } }}
              >
                {run.seed}
              </Link>
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
          <RunTape
            compact
            finished={run.status === "completed"}
            stage={stageOf(run)}
          />
        </li>
      ))}
    </ul>
  );
};
