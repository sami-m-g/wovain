"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wovain/ui/components/accordion";
import { Button } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { Progress } from "@wovain/ui/components/progress";
import { CircleCheckIcon, CircleDashedIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  LaunchProgress,
  LaunchStep,
  OpenStep,
} from "@/components/onboarding/launch-steps";
import { doneCount, LAUNCH_STEPS } from "@/components/onboarding/launch-steps";

const PERCENT = 100;

/**
 * The setup checklist beside the flow. Adapted from the shadcn-studio
 * `onboarding-feed-01` block (accordion checklist with a per-step action and
 * completion state), fed by the merchant's real progress instead of local
 * state. Signed in is ticked on arrival, so the list never starts at zero.
 */
export const LaunchChecklist = ({
  active,
  onOpen,
  progress,
}: {
  active: OpenStep | undefined;
  onOpen: (step: OpenStep) => void;
  progress: LaunchProgress;
}) => {
  const t = useTranslations("Launch");
  const done = doneCount(progress);
  const total = LAUNCH_STEPS.length;
  return (
    <Card className="w-full" data-tour="checklist">
      <CardHeader>
        <CardTitle className="leading-none font-semibold">
          {t("checklist.title")}
        </CardTitle>
        <CardDescription>
          {t("checklist.progress", { done, total })}
        </CardDescription>
        <Progress
          aria-label={t("checklist.progress", { done, total })}
          value={(done / total) * PERCENT}
        />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Accordion
          className='w-full space-y-2 overflow-visible border-0 [&>*>[data-slot="accordion-content"]]:px-0'
          onValueChange={(value) => {
            const [next] = value;
            const step = LAUNCH_STEPS.find((each) => each === next);
            if (step !== undefined && step !== "signin") {
              onOpen(step);
            }
          }}
          value={active === undefined ? [] : [active]}
        >
          {LAUNCH_STEPS.map((step: LaunchStep) => {
            const isDone = progress[step];
            return (
              <AccordionItem
                className="rounded-md border! bg-transparent"
                disabled={step === "signin"}
                key={step}
                value={step}
              >
                <AccordionTrigger className="px-4">
                  <span className="flex items-center gap-2">
                    {isDone ? (
                      <CircleCheckIcon
                        aria-hidden="true"
                        className="text-success size-4 shrink-0"
                      />
                    ) : (
                      <CircleDashedIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    )}
                    <span>{t(`steps.${step}.title`)}</span>
                    <span className="sr-only">
                      {isDone ? t("checklist.done") : t("checklist.open")}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground flex flex-col items-start gap-2 px-4">
                  {t(`steps.${step}.summary`)}
                  {step !== "signin" && !isDone ? (
                    <Button
                      onClick={() => onOpen(step)}
                      size="sm"
                      variant="outline"
                    >
                      {t("checklist.go")}
                    </Button>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
};
