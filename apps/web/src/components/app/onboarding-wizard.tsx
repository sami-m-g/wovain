"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Progress } from "@wovain/ui/components/progress";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { ConnectionHealth } from "@/components/app/connection-health";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { FourthwallSignup } from "@/components/app/fourthwall-signup";
import { AutonomyStep } from "@/components/app/onboarding-autonomy";
import { BrandStep } from "@/components/app/onboarding-brand";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { Link } from "@/i18n/navigation";
import type { OnboardingReady } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const STEPS = ["connect", "brand", "autonomy", "done"] as const;
type Step = (typeof STEPS)[number];
const PERCENT = 100;

const isStep = (value: string | null): value is Step =>
  (STEPS as readonly (string | null)[]).includes(value);

// The step lives in the URL, so a provider's consent page comes back to it.
const pushStep = (step: Step) => {
  window.history.pushState(null, "", `?step=${step}`);
};

const ConnectStep = ({
  onNext,
  status,
}: {
  onNext: () => void;
  status: OnboardingReady;
}) => {
  const t = useTranslations("Onboarding.connect");
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        lead={status.wovainDraws ? t("leadWovainDraws") : t("lead")}
        title={t("title")}
      />
      <ConnectionHealth
        connections={status.connections}
        returnPath="/dashboard/onboarding"
        returnQuery="?step=connect"
      />
      {status.connections.some(
        (each) => each.provider === "fourthwall" && each.state === "missing"
      ) ? (
        <FourthwallSignup className="text-left" surface="onboarding" />
      ) : null}
      <output className="text-muted-foreground block text-sm">
        {status.canStartDrop ? t("ready") : t("notReady")}
      </output>
      <StepActions>
        <NextButton onClick={onNext}>
          {status.steps.connect ? t("next") : t("later")}
        </NextButton>
      </StepActions>
    </div>
  );
};

const DoneStep = ({
  onBack,
  status,
}: {
  onBack: () => void;
  status: OnboardingReady;
}) => {
  const t = useTranslations("Onboarding.done");
  // Reaching this step ends the first run: the overview stops sending the
  // merchant back here.
  const { mutate: finish } = useMutation(
    orpc.onboarding.finish.mutationOptions()
  );
  const { finished } = status;
  useEffect(() => {
    if (!finished) {
      finish({});
    }
  }, [finish, finished]);
  const items = [
    { done: status.steps.connect, key: "connect" },
    { done: status.steps.brand, key: "brand" },
    { done: status.steps.autonomy, key: "autonomy" },
  ] as const;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li className="flex items-center gap-2" key={item.key}>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-5 items-center justify-center rounded-full",
                item.done
                  ? "bg-success text-white"
                  : "border-muted-foreground border"
              )}
            >
              {item.done ? <Check className="size-3" /> : null}
            </span>
            <span>
              {t(`items.${item.key}`)}{" "}
              <span className="sr-only">
                {item.done ? t("doneLabel") : t("openLabel")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <StepActions onBack={onBack}>
        <Link
          className={cn(buttonVariants(), "h-10 sm:h-9")}
          href="/dashboard/new"
        >
          {t("startDrop")}
        </Link>
      </StepActions>
    </div>
  );
};

/**
 * The first-run wizard: connect Fourthwall and Meta, the brand from taste
 * references, the autonomy level and spend caps, then a first drop. Every
 * step can be skipped and shows what was saved.
 */
export const OnboardingWizard = () => {
  const t = useTranslations("Onboarding");
  const searchParams = useSearchParams();
  const requested = searchParams.get("step");
  const step: Step = isStep(requested) ? requested : "connect";
  const go = useCallback((next: Step) => pushStep(next), []);
  const { data, error, isPending } = useQuery(
    orpc.onboarding.status.queryOptions()
  );

  if (isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }
  if (!data.enabled) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("off.title")}</EmptyTitle>
          <EmptyDescription>{t("off.body")}</EmptyDescription>
        </EmptyHeader>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/dashboard"
        >
          {t("off.back")}
        </Link>
      </Empty>
    );
  }

  const index = STEPS.indexOf(step);
  // Without the autonomy-approvals flag there is nothing to set.
  const afterBrand: Step = data.autonomy === null ? "done" : "autonomy";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <Progress
          aria-label={t("progress", {
            step: index + 1,
            total: STEPS.length,
          })}
          value={((index + 1) / STEPS.length) * PERCENT}
        />
        <p className="text-muted-foreground text-sm">
          {t("progress", { step: index + 1, total: STEPS.length })}
        </p>
      </div>
      {step === "connect" ? (
        <ConnectStep onNext={() => go("brand")} status={data} />
      ) : null}
      {step === "brand" ? (
        <BrandStep
          brand={data.brand}
          onBack={() => go("connect")}
          onDone={() => go(afterBrand)}
        />
      ) : null}
      {step === "autonomy" && data.autonomy !== null ? (
        <AutonomyStep
          autonomy={data.autonomy}
          onBack={() => go("brand")}
          onDone={() => go("done")}
        />
      ) : null}
      {step === "done" || (step === "autonomy" && data.autonomy === null) ? (
        <DoneStep onBack={() => go("brand")} status={data} />
      ) : null}
    </div>
  );
};
