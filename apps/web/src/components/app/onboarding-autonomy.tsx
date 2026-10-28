"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@wovain/ui/components/field";
import { Input } from "@wovain/ui/components/input";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import type { OnboardingReady } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const LEVELS = ["suggest", "draft", "publish_ads_paused"] as const;
type Level = (typeof LEVELS)[number];
const CENTS = 100;
// The API refuses caps above $1,000,000.
const MAX_DOLLARS = 1_000_000;

const toCents = (dollars: string) => Math.round(Number(dollars) * CENTS);
const toDollars = (cents: number) => String(cents / CENTS);
const valid = (cents: number) =>
  Number.isFinite(cents) && cents >= 0 && cents <= MAX_DOLLARS * CENTS;

/**
 * How far wovain acts alone, and the most it may spend on ads in a day and
 * a month. Spend always waits for the designer's approval; the caps are
 * hard limits on top.
 */
export const AutonomyStep = ({
  autonomy,
  onBack,
  onDone,
}: {
  autonomy: NonNullable<OnboardingReady["autonomy"]>;
  onBack: () => void;
  onDone: () => void;
}) => {
  const t = useTranslations("Onboarding.autonomy");
  const id = useId();
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<Level>(autonomy.level);
  const [daily, setDaily] = useState(toDollars(autonomy.dailySpendCapCents));
  const [monthly, setMonthly] = useState(
    toDollars(autonomy.monthlySpendCapCents)
  );

  const set = useMutation(
    orpc.autonomy.set.mutationOptions({
      onError: (error) => {
        toast.error(t("saveFailed", { message: error.message }));
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.onboarding.key(),
        });
        onDone();
      },
    })
  );

  const dailyCents = toCents(daily);
  const monthlyCents = toCents(monthly);
  let problem: string | undefined;
  if (!valid(dailyCents) || !valid(monthlyCents)) {
    problem = t("capInvalid");
  } else if (monthlyCents < dailyCents) {
    problem = t("monthlyBelowDaily");
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (problem !== undefined) {
      return;
    }
    set.mutate({
      dailySpendCapCents: dailyCents,
      level,
      monthlySpendCapCents: monthlyCents,
      paused: autonomy.paused,
    });
  };

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={onSubmit}>
      <StepHeader lead={t("lead")} title={t("title")} />
      <FieldSet>
        <FieldLegend>{t("levelLegend")}</FieldLegend>
        <div className="flex flex-col gap-2">
          {LEVELS.map((each) => (
            <label
              aria-labelledby={`${id}-${each}-title`}
              className={cn(
                "border-border flex cursor-pointer gap-3 rounded-lg border p-3",
                "has-[:checked]:border-primary has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3"
              )}
              key={each}
            >
              <input
                checked={level === each}
                className="accent-primary mt-1 size-4 shrink-0"
                name={`${id}-level`}
                onChange={() => setLevel(each)}
                type="radio"
                value={each}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium" id={`${id}-${each}-title`}>
                  {t(`levels.${each}.title`)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {t(`levels.${each}.body`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend>{t("capsLegend")}</FieldLegend>
        <FieldDescription>{t("capsHelp")}</FieldDescription>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={problem === undefined ? undefined : true}>
            <FieldLabel htmlFor={`${id}-daily`}>{t("daily")}</FieldLabel>
            <Input
              className="h-10"
              id={`${id}-daily`}
              inputMode="decimal"
              min={0}
              onChange={(event) => setDaily(event.target.value)}
              step="1"
              type="number"
              value={daily}
            />
          </Field>
          <Field data-invalid={problem === undefined ? undefined : true}>
            <FieldLabel htmlFor={`${id}-monthly`}>{t("monthly")}</FieldLabel>
            <Input
              className="h-10"
              id={`${id}-monthly`}
              inputMode="decimal"
              min={0}
              onChange={(event) => setMonthly(event.target.value)}
              step="1"
              type="number"
              value={monthly}
            />
          </Field>
        </FieldGroup>
        {problem === undefined ? null : <FieldError>{problem}</FieldError>}
      </FieldSet>
      <StepActions
        busyLabel={set.isPending ? t("saving") : undefined}
        onBack={onBack}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onDone} type="button" variant="ghost">
            {t("skip")}
          </Button>
          <NextButton
            disabled={problem !== undefined || set.isPending}
            type="submit"
          >
            {t("save")}
          </NextButton>
        </div>
      </StepActions>
    </form>
  );
};
