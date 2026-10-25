import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

import { inkField, STAGE_INK } from "@/components/brand/swatch";
import type { Run } from "@/lib/flow-client";

const STAGES = ["brief", "trends", "designs", "products", "campaign"] as const;

export type Stage = (typeof STAGES)[number];

/** The backend's step names, mapped onto the strip. */
const STEP_STAGE: Record<string, Stage> = {
  campaign: "campaign",
  design: "designs",
  product: "products",
  publish: "products",
  research: "trends",
};

export const stageOf = (run: Pick<Run, "step">): Stage =>
  (run.step ? STEP_STAGE[run.step] : undefined) ?? "brief";

/**
 * The run as a strip of ink chips: finished stages are lit, the current one
 * is lit and outlined, later ones are unlit (dashed). `compact` drops labels.
 */
export const RunStrip = ({
  stage,
  finished = false,
  compact = false,
  className,
}: {
  stage: Stage;
  finished?: boolean;
  compact?: boolean;
  className?: string;
}) => {
  const t = useTranslations("Stages");
  const current = STAGES.indexOf(stage);

  return (
    <ol
      aria-label={t("stripLabel", { stage: t(stage) })}
      className={cn("grid grid-cols-5 gap-1", className)}
    >
      {STAGES.map((item, index) => {
        let state: "done" | "current" | "pending" = "pending";
        if (finished || index < current) {
          state = "done";
        } else if (index === current) {
          state = "current";
        }
        const lit = state !== "pending";
        return (
          <li
            className={cn(
              "relative flex flex-col justify-end",
              compact ? "h-3" : "min-h-14 p-2",
              lit
                ? inkField[STAGE_INK[item]]
                : "border-input text-muted-foreground border border-dashed",
              state === "current" &&
                !compact &&
                "outline-foreground outline-2 outline-offset-2"
            )}
            key={item}
          >
            {compact ? (
              <span className="sr-only">
                {t(item)}: {t(state)}
              </span>
            ) : (
              <>
                <span className="truncate text-xs font-bold">{t(item)}</span>
                <span className="sr-only">{t(state)}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
};
