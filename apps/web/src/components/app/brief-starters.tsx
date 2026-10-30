"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { progressOf } from "@/components/app/drop-directions";
import { SELLS_NOW_ID } from "@/components/home/story-home";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

const STARTERS = 4;
const FALLBACK = ["starter1", "starter2", "starter3"] as const;
const SKELETONS = ["a", "b", "c"] as const;

/**
 * Brief starters under the brief box: short, editable lines from the kept
 * "What sells now" suggestions (fixed examples while there are none). A
 * starter only fills the box; "Research trends" still runs the research.
 * The researched ideas themselves live on the Home, one link away.
 */
export const BriefStarters = ({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (brief: string) => void;
}) => {
  const t = useTranslations("Wizard.brief");
  // The same kept answer the Home shows: no new research.
  const directions = useQuery(
    orpc.runs.directions.experimental_streamedOptions({
      input: { ignoreBrand: false, round: 0 },
      queryFnOptions: { refetchMode: "reset" },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  const { answer } = progressOf(directions.data ?? []);
  const loading = !directions.isError && answer === undefined;
  const kept = answer?.directions ?? [];
  const starters =
    kept.length > 0
      ? kept.slice(0, STARTERS).map((card) => ({
          brief: card.brief,
          key: card.key,
          label: card.title,
        }))
      : FALLBACK.map((key) => ({ brief: t(key), key, label: t(key) }));
  return (
    <div className="flex flex-col gap-3">
      <fieldset aria-busy={loading} className="flex flex-col gap-2">
        <legend className="text-muted-foreground mb-2 text-xs font-medium">
          {t("starters")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {loading
            ? SKELETONS.map((key) => (
                <Skeleton className="h-8 w-44 rounded-full" key={key} />
              ))
            : null}
          {loading
            ? null
            : starters.map((starter) => (
                <Button
                  className="h-auto min-h-8 rounded-full px-3 py-1.5 text-start whitespace-normal"
                  disabled={disabled}
                  key={starter.key}
                  onClick={() => onPick(starter.brief)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {starter.label}
                </Button>
              ))}
        </div>
      </fieldset>
      <Link
        className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
        href={`/dashboard#${SELLS_NOW_ID}`}
      >
        {t("pickIdea")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
};
