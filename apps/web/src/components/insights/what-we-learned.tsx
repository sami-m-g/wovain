"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@wovain/ui/components/reui/frame";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import type { Learned } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// A weight within this share of its default reads as unchanged.
const SAME = 0.02;
const TERMS = [
  "demand",
  "momentum",
  "recency",
  "relevance",
  "openness",
  "margin",
  "ipSafety",
] as const satisfies readonly (keyof Learned["weights"])[];

const LearningList = ({
  empty,
  items,
  title,
}: {
  empty: string;
  items: string[];
  title: string;
}) => (
  <FramePanel className="flex flex-col gap-2">
    <h3 className="text-sm font-medium">{title}</h3>
    {items.length > 0 ? (
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li className="text-pretty" key={item}>
            {item}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground text-sm">{empty}</p>
    )}
  </FramePanel>
);

const Weights = ({ learned }: { learned: Learned }) => {
  const t = useTranslations("Insights.learned");
  const format = useFormatter();
  const percent = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, style: "percent" });
  return (
    <FramePanel className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("weightsTitle")}</h3>
        <p className="text-muted-foreground text-xs">
          {learned.version === 0
            ? t("defaultsLead")
            : t("weightsLead", {
                samples: learned.samples,
                version: learned.version,
              })}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1 text-start font-normal" scope="col">
              {t("term")}
            </th>
            <th className="py-1 text-end font-normal" scope="col">
              {t("now")}
            </th>
            <th className="py-1 text-end font-normal" scope="col">
              {t("default")}
            </th>
          </tr>
        </thead>
        <tbody>
          {TERMS.map((term) => {
            const now = learned.weights[term];
            const prior = learned.defaults[term];
            const shift = prior > 0 ? (now - prior) / prior : 0;
            return (
              <tr className="border-t" key={term}>
                <th className="py-1.5 text-start font-normal" scope="row">
                  {t(`terms.${term}`)}
                </th>
                <td className="figures py-1.5 text-end">
                  <span className="inline-flex items-center gap-1">
                    {shift > SAME ? (
                      <ArrowUp
                        aria-label={t("up")}
                        className="text-primary size-3.5"
                      />
                    ) : null}
                    {shift < -SAME ? (
                      <ArrowDown
                        aria-label={t("down")}
                        className="text-muted-foreground size-3.5"
                      />
                    ) : null}
                    {percent(now)}
                  </span>
                </td>
                <td className="figures text-muted-foreground py-1.5 text-end">
                  {percent(prior)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </FramePanel>
  );
};

/**
 * "What we learned": what sold, what didn't, and how the idea score
 * weights moved from their defaults (packages/api feedback.learned).
 */
export const WhatWeLearned = () => {
  const t = useTranslations("Insights.learned");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const options = orpc.feedback.learned.queryOptions();
  const { data, error, isPending } = useQuery(options);
  const learn = useMutation(
    orpc.feedback.learn.mutationOptions({
      onSuccess: (fresh) => {
        queryClient.setQueryData(options.queryKey, fresh);
      },
    })
  );
  const shown = learn.data ?? data;
  const enough = shown !== undefined && shown.samples >= shown.minSamples;

  return (
    <Frame>
      <FrameHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <FrameTitle className="font-display text-lg font-semibold tracking-[-0.015em]">
            <h2>{t("title")}</h2>
          </FrameTitle>
          <FrameDescription className="max-w-[60ch] text-sm">
            {t("lead")}
          </FrameDescription>
        </div>
        <div className="flex items-center gap-2">
          {shown?.fittedAt ? (
            <Badge variant="outline">
              {t("updated", {
                date: format.dateTime(new Date(shown.fittedAt), {
                  dateStyle: "medium",
                }),
              })}
            </Badge>
          ) : null}
          <Button
            disabled={learn.isPending}
            onClick={() => {
              learn.mutate({});
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={learn.isPending ? "size-3.5 animate-spin" : "size-3.5"}
            />
            {learn.isPending ? t("refreshing") : t("refresh")}
          </Button>
        </div>
      </FrameHeader>
      {isPending ? <Skeleton className="h-40 w-full rounded-xl" /> : null}
      {error ? <FlowProblemNotice problem={describeProblem(error)} /> : null}
      {learn.error ? (
        <FlowProblemNotice problem={describeProblem(learn.error)} />
      ) : null}
      {shown === undefined ? null : (
        <div className="flex flex-col gap-(--frame-gap)">
          {enough ? null : (
            <FramePanel>
              <p className="text-muted-foreground text-sm">
                {t("notEnough", {
                  minLiveDays: shown.minLiveDays,
                  minSamples: shown.minSamples,
                  samples: shown.samples,
                })}
              </p>
            </FramePanel>
          )}
          <div className="grid gap-(--frame-gap) md:grid-cols-2">
            <LearningList
              empty={t("noneSold")}
              items={shown.learned.sold}
              title={t("sold")}
            />
            <LearningList
              empty={t("noneUnsold")}
              items={shown.learned.unsold}
              title={t("unsold")}
            />
          </div>
          <Weights learned={shown} />
        </div>
      )}
    </Frame>
  );
};
