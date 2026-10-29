"use client";

import type { ArmMetrics } from "@wovain/core/ablation";
import { qlooAblation } from "@wovain/core/ablation-report";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

// "Without Qloo", greyed beside the ideas Qloo just decided: the committed
// ablation (packages/core/src/evals/qloo-ablation.eval.ts) ran the same
// theme step on eight seeds with Qloo's taste graph and with Nemotron
// alone. The figures say what each idea stands on, not how well it sells.

type Metric = "grounded" | "explained" | "crossDomains" | "cues";
const METRICS: Metric[] = ["grounded", "explained", "crossDomains", "cues"];
const PERCENT: ReadonlySet<Metric> = new Set(["grounded", "explained"]);

const useValue = () => {
  const format = useFormatter();
  return (metric: Metric, arm: ArmMetrics) =>
    PERCENT.has(metric)
      ? format.number(arm[metric], {
          maximumFractionDigits: 0,
          style: "percent",
        })
      : format.number(arm[metric], { maximumFractionDigits: 1 });
};

const Themes = ({ themes }: { themes: string[] }) => {
  const t = useTranslations("WithoutQloo");
  return themes.length === 0 ? (
    <span className="text-muted-foreground italic">{t("noMatch")}</span>
  ) : (
    <span>{themes.join(", ")}</span>
  );
};

export const WithoutQlooPanel = () => {
  const t = useTranslations("WithoutQloo");
  const format = useFormatter();
  const value = useValue();
  const titleId = useId();
  const { at, llmOnly, model, seeds, withQloo } = qlooAblation;
  return (
    <section
      aria-labelledby={titleId}
      className="border-border bg-muted/40 flex flex-col gap-4 rounded-xl border border-dashed p-4 text-sm"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-semibold" id={titleId}>
          {t("title")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("lead", {
            date: format.dateTime(new Date(at), { dateStyle: "medium" }),
            model,
            seeds: seeds.length,
          })}
        </p>
      </header>
      <table className="w-full text-xs">
        <caption className="sr-only">{t("tableCaption")}</caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="py-1 font-medium">
              {t("metric")}
            </th>
            <th scope="col" className="py-1 font-semibold">
              {t("withQloo")}
            </th>
            <th scope="col" className="text-muted-foreground py-1 font-medium">
              {t("withoutQloo")}
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => (
            <tr className="border-border border-t" key={metric}>
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                {t(`metrics.${metric}`)}
              </th>
              <td className="figures py-1.5 font-semibold">
                {value(metric, withQloo)}
              </td>
              <td className="figures text-muted-foreground py-1.5">
                {value(metric, llmOnly)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium">
          {t("seedsSummary", { seeds: seeds.length })}
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {seeds.map((item) => (
            <li
              className="grid gap-1 sm:grid-cols-[8rem_1fr_1fr] sm:gap-3"
              key={item.seed}
            >
              <span className="font-medium">{item.seed}</span>
              <span>
                <span className="sr-only">{t("withQloo")}: </span>
                <Themes themes={item.withQloo} />
              </span>
              <span className="text-muted-foreground">
                <span className="sr-only">{t("withoutQloo")}: </span>
                <Themes themes={item.llmOnly} />
              </span>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </section>
  );
};
