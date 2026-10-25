import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

const STAGES = ["brief", "trends", "designs", "products", "campaign"] as const;

export type Stage = (typeof STAGES)[number];

/** The backend's step names, mapped onto the tape. */
const STEP_STAGE: Record<string, Stage> = {
  campaign: "campaign",
  design: "designs",
  product: "products",
  publish: "products",
  research: "trends",
};

export const stageOf = (run: { step?: string | null }): Stage =>
  (run.step ? STEP_STAGE[run.step] : undefined) ?? "brief";

type State = "done" | "current" | "pending";

const stateOf = (index: number, current: number, finished: boolean): State => {
  if (finished || index < current) {
    return "done";
  }
  return index === current ? "current" : "pending";
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
  compact = false,
  weave = false,
  className,
}: {
  stage: Stage;
  finished?: boolean;
  compact?: boolean;
  weave?: boolean;
  className?: string;
}) => {
  const t = useTranslations("Stages");
  const current = STAGES.indexOf(stage);

  return (
    <ol
      aria-label={t("stripLabel", { stage: t(stage) })}
      className={cn(
        "grid grid-cols-5 overflow-hidden",
        compact ? "h-1.5 gap-0.5 rounded-full" : "gap-px rounded-lg",
        className
      )}
    >
      {STAGES.map((item, index) => {
        const state = stateOf(index, current, finished);
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
              compact ? "h-full" : "h-9 px-2.5 sm:px-3",
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
                  state !== "current" && "max-sm:sr-only"
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
};
