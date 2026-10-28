"use client";

import { Badge } from "@wovain/ui/components/badge";
import { CircleAlert, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { Idea } from "@/lib/flow-client";

type TasteMap = NonNullable<Idea["research"]["taste"]>;

const DOMAINS = new Set(["brand", "movie", "tv_show"]);

/**
 * "Why this idea": what Qloo's taste graph said about it. The seed entities
 * Qloo matched, the theme's Qloo tag, and what the same fans like in other
 * domains, with each seed entity's share (Qloo's explainability). When Qloo
 * failed, matched nothing or was off for the run, it says so instead.
 */
export const TasteMapPanel = ({ taste }: { taste: TasteMap }) => {
  const t = useTranslations("Wizard.trends");
  const format = useFormatter();
  const decimal = (value: number) =>
    format.number(value, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  const percent = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, style: "percent" });

  if (taste.status !== "used") {
    const message = {
      failed: t("whyFailed"),
      no_match: t("whyNoMatch"),
      off: t("whyOff"),
    }[taste.status];
    return (
      <p
        className="text-muted-foreground flex items-start gap-1.5 px-1 text-xs"
        role={taste.status === "failed" ? "alert" : undefined}
      >
        <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          <span className="text-foreground font-semibold">{t("why")}: </span>
          {message}
        </span>
      </p>
    );
  }

  const seeds = format.list(
    taste.seeds.map(({ name }) => name),
    { type: "conjunction" }
  );
  const cues = [
    ...new Set(taste.affinities.flatMap((affinity) => affinity.cues)),
  ].slice(0, 8);

  return (
    <details className="group bg-muted/50 rounded-md px-3 py-2 text-xs">
      <summary className="text-foreground inline-flex min-h-6 cursor-pointer items-center gap-1.5 font-semibold">
        <Sparkles aria-hidden="true" className="size-3.5" />
        {t("why")}
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <p>
          {taste.tag
            ? t("whyTag", { seeds, tag: taste.tag.name })
            : t("whyNoTag")}
          {taste.tag ? (
            <span className="text-muted-foreground figures">
              {" "}
              ({t("affinity")} {decimal(taste.tag.affinity)})
            </span>
          ) : null}
        </p>
        {taste.affinities.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground font-medium">{t("whyAlso")}</p>
            <ul className="flex flex-col gap-1">
              {taste.affinities.map((affinity) => (
                <li
                  className="flex flex-wrap items-baseline gap-x-2"
                  key={affinity.id}
                >
                  <span className="font-semibold">{affinity.name}</span>
                  {DOMAINS.has(affinity.type) ? (
                    <span className="text-muted-foreground">
                      {t(
                        `domain.${affinity.type as "brand" | "movie" | "tv_show"}`
                      )}
                    </span>
                  ) : null}
                  <span className="figures">{decimal(affinity.affinity)}</span>
                  {affinity.because.length > 0 ? (
                    <span className="text-muted-foreground">
                      {format.list(
                        affinity.because.map(({ name, share }) =>
                          t("whyShare", { name, share: percent(share) })
                        ),
                        { type: "unit" }
                      )}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {cues.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground font-medium">{t("whyCues")}</p>
            <ul className="flex flex-wrap gap-1">
              {cues.map((cue) => (
                <li key={cue}>
                  <Badge variant="outline">{cue}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
};
