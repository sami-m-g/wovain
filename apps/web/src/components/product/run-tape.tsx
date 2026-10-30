import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

export const STAGES = [
  "brief",
  "trends",
  "designs",
  "products",
  "campaign",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_COUNT = STAGES.length;

/** The backend's step names, mapped onto the tape. */
const STEP_STAGE: Record<string, Stage> = {
  // The design gate: waiting on the merchant, then their decision.
  approval: "designs",
  approved: "designs",
  campaign: "campaign",
  design: "designs",
  // The ideas gate: the ideas are read and wait for the merchant's pick.
  ideas: "trends",
  name: "trends",
  product: "products",
  publish: "products",
  rejected: "designs",
  research: "trends",
};

export const stageOf = (run: { step?: string | null }): Stage =>
  (run.step ? STEP_STAGE[run.step] : undefined) ?? "brief";

/**
 * The furthest stage a run has reached, from what it holds as well as the
 * step it reports: a Home pick starts at designs, so brief and trends count
 * as done through the cached direction and the automatic research.
 */
export const reachedStage = (run: {
  step?: string | null;
  ideas: unknown[];
  designs: unknown[];
  products: unknown[];
  campaigns: unknown[];
}): Stage => {
  const byData: Stage[] = [
    ...(run.ideas.length > 0 ? (["trends"] as const) : []),
    ...(run.designs.length > 0 ? (["designs"] as const) : []),
    ...(run.products.length > 0 ? (["products"] as const) : []),
    ...(run.campaigns.length > 0 ? (["campaign"] as const) : []),
  ];
  let far = stageOf(run);
  for (const item of byData) {
    if (STAGES.indexOf(item) > STAGES.indexOf(far)) {
      far = item;
    }
  }
  return far;
};

type State = "done" | "current" | "pending";

export const stateOf = (
  index: number,
  current: number,
  passed: number,
  finished: boolean
): State => {
  if (finished) {
    return "done";
  }
  if (index === current) {
    return "current";
  }
  return index < passed ? "done" : "pending";
};

/**
 * The run as one continuous label tape: finished passages are woven solid,
 * the current one carries the cochineal dye, later ones are a hairline thread.
 * `compact` draws a thin tape without labels (for lists). `weave` plays the
 * one-time weaving motion on the finished passages.
 */
export const RunTape = ({
  stage,
  finished = false,
  reached,
  compact = false,
  weave = false,
  className,
}: {
  stage: Stage;
  finished?: boolean;
  reached?: Stage;
  compact?: boolean;
  weave?: boolean;
  className?: string;
}) => {
  const t = useTranslations("Stages");
  const current = STAGES.indexOf(stage);
  const passed = Math.max(current, reached ? STAGES.indexOf(reached) : 0);

  const tape = (
    <ol
      aria-label={t("stripLabel", { stage: t(stage) })}
      className={cn(
        "grid grid-cols-5 overflow-hidden",
        compact
          ? "h-1.5 gap-0.5 rounded-full"
          : "gap-px rounded-full sm:rounded-lg",
        className
      )}
    >
      {STAGES.map((item, index) => {
        const state = stateOf(index, current, passed, finished);
        const fill = {
          current: "bg-primary",
          done: "bg-foreground",
          pending: compact ? "bg-border" : "",
        }[state];
        const woven = weave && state !== "pending";
        return (
          <li
            className={cn(
              "relative flex min-w-0 items-center",
              compact ? "h-full" : "h-2 sm:h-9 sm:px-3",
              !woven && fill,
              state === "pending" &&
                !compact &&
                "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]",
              state === "done" && "text-background",
              state === "current" && "text-primary-foreground"
            )}
            key={item}
          >
            {woven ? (
              <span
                aria-hidden="true"
                className={cn(
                  "animate-weave absolute inset-0 origin-left",
                  fill
                )}
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ) : null}
            {compact ? (
              <span className="sr-only">
                {t(item)}: {t(state)}
              </span>
            ) : (
              <span
                className={cn(
                  "relative truncate text-xs font-medium",
                  "max-sm:sr-only"
                )}
              >
                {t(item)}
                <span className="sr-only">: {t(state)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
  if (compact) {
    return tape;
  }
  // Small screens draw a thin tape and name the current passage below it.
  return (
    <div className="flex flex-col gap-1.5">
      {tape}
      <p aria-hidden="true" className="text-xs font-medium sm:hidden">
        {t(stage)}
      </p>
    </div>
  );
};
