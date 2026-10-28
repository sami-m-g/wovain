"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { DataColumn } from "@/components/app/data-table";
import { DataTable } from "@/components/app/data-table";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import type { ModelTrace as Trace } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type Entry = Trace["entries"][number];
type Role = keyof Trace["models"];

const ROLES = [
  "default",
  "reasoning",
  "vision",
  "fast",
  "safety",
] as const satisfies readonly Role[];

const AGENTS = [
  "ad_copy",
  "ad_judge",
  "autopilot_pick_idea",
  "autopilot_review_design",
  "design_brief",
  "design_judge",
  "design_vision",
  "grounding_guard",
  "research_themes",
] as const;
type KnownAgent = (typeof AGENTS)[number];
const isKnownAgent = (agent: string): agent is KnownAgent =>
  (AGENTS as readonly string[]).includes(agent);

/** The model each job runs on in this environment. */
const ModelsByJob = ({ models }: { models: Trace["models"] }) => {
  const t = useTranslations("Models");
  return (
    <section aria-labelledby="models-by-job" className="flex flex-col gap-3">
      <h2
        className="font-display text-lg font-semibold tracking-[-0.015em]"
        id="models-by-job"
      >
        {t("byJob")}
      </h2>
      <dl className="border-border bg-card divide-border grid divide-y rounded-xl border">
        {ROLES.map((role) => (
          <div
            className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
            key={role}
          >
            <dt className="font-medium">{t(`roles.${role}.name`)}</dt>
            <dd className="text-muted-foreground text-sm">
              {t(`roles.${role}.job`)}
            </dd>
            <dd>
              <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                {models[role]}
              </code>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const useColumns = (): DataColumn<Entry>[] => {
  const t = useTranslations("Models");
  const format = useFormatter();
  return useMemo(
    () => [
      {
        accessorKey: "agent",
        cell: ({ row }) =>
          isKnownAgent(row.original.agent)
            ? t(`agents.${row.original.agent}`)
            : row.original.agent,
        header: t("step"),
      },
      {
        accessorKey: "role",
        cell: ({ row }) =>
          row.original.role === null
            ? t("rule")
            : t(`roles.${row.original.role}.name`),
        header: t("job"),
      },
      {
        accessorKey: "model",
        cell: ({ row }) =>
          row.original.model === null ? (
            t("noModel")
          ) : (
            <code className="text-xs">{row.original.model}</code>
          ),
        header: t("model"),
      },
      {
        accessorKey: "ms",
        cell: ({ row }) =>
          row.original.ms === null
            ? "–"
            : t("seconds", {
                seconds: format.number(row.original.ms / 1000, {
                  maximumFractionDigits: 1,
                }),
              }),
        header: t("time"),
        meta: {
          cellClassName: "text-end figures",
          headerClassName: "text-end",
        },
      },
      {
        accessorKey: "ok",
        cell: ({ row }) => (
          <span className="flex min-w-40 flex-col gap-1 whitespace-normal">
            <Badge
              className="w-fit"
              variant={row.original.ok ? "secondary" : "destructive"}
            >
              {row.original.ok ? t("ok") : t("failed")}
            </Badge>
            {row.original.note === null ? null : (
              <span className="text-muted-foreground text-xs">
                {row.original.note}
              </span>
            )}
          </span>
        ),
        header: t("result"),
      },
    ],
    [format, t]
  );
};

/** Every agent call of one run, in order, with the model it ran on. */
const RunTrace = ({ trace }: { trace: Trace }) => {
  const t = useTranslations("Models");
  const columns = useColumns();
  if (trace.run === null || trace.entries.length === 0) {
    return (
      <Empty className="border-input border border-dashed">
        <EmptyHeader>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("empty")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <section aria-labelledby="models-run" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          className="font-display text-lg font-semibold tracking-[-0.015em]"
          id="models-run"
        >
          {t("runTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("runLead", { calls: trace.entries.length, seed: trace.run.seed })}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={trace.entries}
        rowId={(entry) => entry.id}
      />
    </section>
  );
};

export const ModelTrace = ({ runId }: { runId?: string | undefined }) => {
  const { data, error, isPending } = useQuery(
    orpc.models.trace.queryOptions({ input: { runId }, retry: false })
  );
  if (isPending) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }
  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }
  return (
    <div className="flex flex-col gap-8">
      <ModelsByJob models={data.models} />
      <RunTrace trace={data} />
    </div>
  );
};
