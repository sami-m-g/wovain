"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@wovain/ui/components/item";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { Bot, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { DataColumn } from "@/components/app/data-table";
import { DataTable } from "@/components/app/data-table";
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

const runHref = (run: Run) => ({
  pathname: "/dashboard/new" as const,
  query: { run: run.id },
});

const StatusBadge = ({ status }: { status: Run["status"] }) => {
  const t = useTranslations("Status");
  return (
    <Badge className="w-fit" variant={STATUS_VARIANT[status]}>
      {t(status)}
    </Badge>
  );
};

const Mode = ({ autopilot }: { autopilot: boolean }) => {
  const t = useTranslations("Runs");
  const Icon = autopilot ? Bot : UserRound;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" className="size-4" />
      {autopilot ? t("autopilot") : t("manual")}
    </span>
  );
};

const Started = ({ at }: { at: Run["createdAt"] }) => {
  const format = useFormatter();
  const date = new Date(at);
  return (
    <time className="figures" dateTime={date.toISOString()}>
      {format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
};

const RunsEmpty = () => {
  const t = useTranslations("Runs");
  return (
    <Empty className="border-input border border-dashed">
      <EmptyHeader>
        <RunTape className="mb-2 w-40" compact stage="brief" />
        <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("empty")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          className={cn(buttonVariants({ variant: "outline" }), "h-9 px-4")}
          href="/dashboard/new"
        >
          {t("emptyCta")}
        </Link>
      </EmptyContent>
    </Empty>
  );
};

const useRuns = () => useQuery(orpc.runs.list.queryOptions());

/** Runs as a list of rows: the overview, and the runs page on phones. */
const RunItems = ({ runs }: { runs: Run[] }) => {
  const t = useTranslations("Runs");
  return (
    <ul className="border-border bg-card divide-border flex w-full flex-col divide-y rounded-xl border">
      {runs.map((run) => (
        <li key={run.id}>
          <Item
            className="rounded-none px-4 py-3.5 sm:px-5"
            render={<Link href={runHref(run)} />}
          >
            <ItemContent className="min-w-0 gap-2">
              <ItemTitle className="w-full text-pretty">
                <span className="line-clamp-2">{run.seed}</span>
              </ItemTitle>
              <ItemDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <StatusBadge status={run.status} />
                <Mode autopilot={run.autopilot} />
                <Started at={run.createdAt} />
              </ItemDescription>
              {run.status === "failed" && run.error ? (
                <p className="text-destructive text-sm">
                  {t("stoppedAt", { error: run.error })}
                </p>
              ) : null}
            </ItemContent>
            <RunTape
              className="w-full sm:w-36"
              compact
              finished={run.status === "completed"}
              stage={stageOf(run)}
            />
          </Item>
        </li>
      ))}
    </ul>
  );
};

/** The latest runs as a compact list, for the overview. */
export const RecentRuns = ({ limit }: { limit: number }) => {
  const { data, error, isPending } = useRuns();

  if (isPending) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }
  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }
  if (data.length === 0) {
    return <RunsEmpty />;
  }
  return <RunItems runs={data.slice(0, limit)} />;
};

const useColumns = (): DataColumn<Run>[] => {
  const t = useTranslations("Runs");
  return useMemo(
    () => [
      {
        accessorKey: "seed",
        cell: ({ row }) => (
          <span className="flex min-w-56 flex-col gap-1 whitespace-normal">
            <Link
              className="font-medium text-pretty hover:underline"
              href={runHref(row.original)}
            >
              {row.original.seed}
            </Link>
            {row.original.status === "failed" && row.original.error ? (
              <span className="text-destructive text-xs">
                {t("stoppedAt", { error: row.original.error })}
              </span>
            ) : null}
          </span>
        ),
        header: t("brief"),
      },
      {
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        header: t("status"),
      },
      {
        cell: ({ row }) => (
          <RunTape
            className="w-32"
            compact
            finished={row.original.status === "completed"}
            stage={stageOf(row.original)}
          />
        ),
        header: t("progress"),
        id: "progress",
      },
      {
        accessorKey: "autopilot",
        cell: ({ row }) => <Mode autopilot={row.original.autopilot} />,
        header: t("mode"),
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => <Started at={row.original.createdAt} />,
        header: t("started"),
      },
    ],
    [t]
  );
};

/** Every run as a ReUI data grid, newest first; rows on phones. */
export const RunsTable = () => {
  const { data, error, isPending } = useRuns();
  const columns = useColumns();

  if (isPending) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }
  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }
  if (data.length === 0) {
    return <RunsEmpty />;
  }

  return (
    <>
      {/* Five columns don't fit a phone; it gets the row list instead. */}
      <div className="md:hidden">
        <RunItems runs={data} />
      </div>
      <div className="hidden md:block">
        <DataTable columns={columns} data={data} rowId={(run) => run.id} />
      </div>
    </>
  );
};
