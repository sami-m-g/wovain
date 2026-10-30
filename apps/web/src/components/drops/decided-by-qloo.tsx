"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@wovain/ui/components/popover";
import { cn } from "@wovain/ui/lib/utils";
import { Sparkle } from "lucide-react";
import { useTranslations } from "next-intl";

export interface QlooEvidence {
  label: string;
  value: string;
}

/**
 * "Decided by Qloo": the one mark that a decision came from Qloo's taste
 * data (openspec story-ui). It opens what Qloo decided, in plain words
 * first, then the evidence behind it. Used only where Qloo decides: the
 * suggestion, the idea, the audience and the targeting.
 */
export const DecidedByQloo = ({
  className,
  decision,
  evidence,
}: {
  className?: string;
  // The decision in a sentence, e.g. "Romance fits coffee buyers who watch K-drama".
  decision: string;
  evidence: readonly QlooEvidence[];
}) => {
  const t = useTranslations("Qloo");
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-primary/30 bg-accent-soft text-accent-text focus-visible:ring-ring inline-flex h-7 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none focus-visible:ring-2",
          className
        )}
        type="button"
      >
        <Sparkle aria-hidden="true" className="size-3.5" />
        {t("decided")}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t("title")}</PopoverTitle>
          <PopoverDescription className="text-foreground">
            {decision}
          </PopoverDescription>
        </PopoverHeader>
        {evidence.length > 0 ? (
          <dl className="border-border flex flex-col gap-1.5 border-t pt-2.5 text-xs">
            {evidence.map((item) => (
              <div className="flex flex-col gap-0.5" key={item.label}>
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
