"use client";

import { useMutation } from "@tanstack/react-query";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Field, FieldLabel } from "@wovain/ui/components/field";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Textarea } from "@wovain/ui/components/textarea";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { ConnectionHealth } from "@/components/app/connection-health";
import { DropDirections } from "@/components/app/drop-directions";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { FourthwallSignup } from "@/components/app/fourthwall-signup";
import { AutonomyStep } from "@/components/app/onboarding-autonomy";
import { BrandStep } from "@/components/app/onboarding-brand";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { MAX_BRIEF } from "@/components/app/wizard-steps";
import { LaunchChecklist } from "@/components/shadcn-studio/blocks/onboarding-feed-01/onboarding-feed-01";
import { MetaSetup } from "@/components/store/meta-setup";
import { StoreSetup } from "@/components/store/store-setup";
import { Link, useRouter } from "@/i18n/navigation";
import type { OnboardingReady, RunDetail } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import type { LaunchProgress, OpenStep } from "./launch-steps";
import {
  currentStep,
  launchedAt,
  launchProgress,
  OPEN_STEPS,
} from "./launch-steps";
import { LaunchTimer } from "./launch-timer";
import type { LaunchData } from "./use-launch-facts";
import { useLaunchFacts } from "./use-launch-facts";
import { useSpotlight } from "./use-spotlight";

const RUN_ID = /^[\w-]{1,64}$/u;

interface LaunchUrl {
  brief?: string | undefined;
  run?: string | undefined;
  step?: OpenStep | undefined;
}

const queryOf = ({ brief, run, step }: LaunchUrl) => {
  const params = new URLSearchParams();
  if (step) {
    params.set("step", step);
  }
  if (brief) {
    params.set("brief", brief);
  }
  if (run) {
    params.set("run", run);
  }
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
};

// The flow lives in the URL, so a provider's consent page and the drop flow
// come back to the same step.
const useLaunchUrl = () => {
  const params = useSearchParams();
  const step = OPEN_STEPS.find((each) => each === params.get("step"));
  const run = params.get("run") ?? undefined;
  const url: LaunchUrl = {
    brief: params.get("brief")?.trim() || undefined,
    run: run !== undefined && RUN_ID.test(run) ? run : undefined,
    step,
  };
  const push = (next: LaunchUrl) => {
    window.history.pushState(null, "", queryOf({ ...url, ...next }));
  };
  return { push, url };
};

// A direction fills the brief; with none (or Qloo off), the merchant writes it.
export const SellStep = ({
  brief,
  brand,
  onNext,
}: {
  brand: OnboardingReady["brand"];
  brief: string | undefined;
  onNext: (brief: string) => void;
}) => {
  const t = useTranslations("Launch.sell");
  const tBrief = useTranslations("Wizard.brief");
  const id = useId();
  const [draft, setDraft] = useState(brief ?? "");
  // The brand is optional: with one, the directions fit it.
  const [brandOpen, setBrandOpen] = useState(false);
  const closeBrand = () => setBrandOpen(false);
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      <div data-tour="sell">
        <DropDirections disabled={false} onUse={setDraft} />
      </div>
      <Field>
        <FieldLabel htmlFor={id}>{tBrief("label")}</FieldLabel>
        <Textarea
          className="min-h-20 text-base md:text-sm"
          id={id}
          maxLength={MAX_BRIEF}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={tBrief("placeholder")}
          value={draft}
        />
      </Field>
      <details
        className="rounded-md border p-4"
        onToggle={(event) => setBrandOpen(event.currentTarget.open)}
        open={brandOpen}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {t("brand")}
        </summary>
        {brandOpen ? (
          <div className="mt-4">
            <BrandStep brand={brand} onBack={closeBrand} onDone={closeBrand} />
          </div>
        ) : null}
      </details>
      <StepActions>
        <NextButton
          disabled={draft.trim() === ""}
          onClick={() => onNext(draft.trim())}
        >
          {t("next")}
        </NextButton>
      </StepActions>
    </div>
  );
};

const StoreStep = ({
  connections,
  onNext,
  returnQuery,
}: {
  connections: OnboardingReady["connections"];
  onNext: () => void;
  returnQuery: string;
}) => {
  const t = useTranslations("Launch.store");
  const fourthwall = connections.filter(
    (each) => each.provider === "fourthwall"
  );
  const connected = fourthwall.every((each) => each.state === "connected");
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      <div data-tour="store">
        <ConnectionHealth
          connections={fourthwall}
          returnPath="/dashboard/onboarding"
          returnQuery={returnQuery}
        />
      </div>
      {connected ? (
        <StoreSetup />
      ) : (
        <FourthwallSignup className="text-left" surface="onboarding" />
      )}
      <StepActions>
        <NextButton onClick={onNext}>{t("next")}</NextButton>
      </StepActions>
    </div>
  );
};

const MetaStep = ({
  status,
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
  status: OnboardingReady;
}) => {
  const t = useTranslations("Launch.meta");
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      {/* Ad account, payment, Page and safety rules, each a deep link that
          ticks off by polling; connect and reconnect Meta here too. */}
      <div data-tour="meta">
        <MetaSetup />
      </div>
      {status.autonomy === null ? (
        <StepActions>
          <NextButton onClick={onNext}>{t("next")}</NextButton>
        </StepActions>
      ) : (
        <AutonomyStep
          autonomy={status.autonomy}
          onBack={onBack}
          onDone={onNext}
        />
      )}
    </div>
  );
};

const DropFlowCard = ({
  action,
  lead,
  run,
  title,
}: {
  action: string;
  lead: string;
  run: string;
  title: string;
}) => (
  <div className="flex flex-col gap-6">
    <StepHeader lead={lead} title={title} />
    <Link
      className={cn(buttonVariants(), "h-10 self-start sm:h-9")}
      data-tour="drop-flow"
      href={{ pathname: "/dashboard/new", query: { run } }}
    >
      {action}
    </Link>
  </div>
);

export const DesignStep = ({
  brief,
  onRun,
  run,
}: {
  brief: string | undefined;
  onRun: (id: string) => void;
  run: RunDetail | undefined;
}) => {
  const t = useTranslations("Launch.design");
  const start = useMutation(orpc.runs.start.mutationOptions());
  if (run !== undefined) {
    return (
      <DropFlowCard
        action={t("open")}
        lead={run.status === "running" ? t("working") : t("ready")}
        run={run.id}
        title={t("title")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        lead={brief ? t("lead", { brief }) : t("noBrief")}
        title={t("title")}
      />
      {start.error ? (
        <FlowProblemNotice problem={describeProblem(start.error)} />
      ) : null}
      <Button
        className="self-start"
        data-tour="design-start"
        disabled={!brief || start.isPending}
        onClick={() => {
          if (brief) {
            start.mutate(
              { seed: brief },
              { onSuccess: (created) => onRun(created.id) }
            );
          }
        }}
      >
        {t("start")}
      </Button>
    </div>
  );
};

const FinishedStep = ({ run }: { run: string | undefined }) => {
  const t = useTranslations("Launch.finished");
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      {run ? (
        <Link
          className={cn(buttonVariants(), "h-10 self-start sm:h-9")}
          data-tour="campaign"
          href={{ pathname: "/dashboard/campaign", query: { run } }}
        >
          {t("open")}
        </Link>
      ) : null}
    </div>
  );
};

const SPOT_SELECTORS: Record<OpenStep, string> = {
  ads: "[data-tour='drop-flow']",
  design: "[data-tour='design-start'], [data-tour='drop-flow']",
  meta: "[data-tour='meta']",
  sell: "[data-tour='sell']",
  store: "[data-tour='store']",
};

const StepPanel = ({
  active,
  data,
  onBrief,
  onOpen,
  onRun,
  returnQuery,
  url,
}: {
  active: OpenStep | undefined;
  data: LaunchData;
  onBrief: (brief: string) => void;
  onOpen: (step: OpenStep) => void;
  onRun: (id: string) => void;
  returnQuery: string;
  url: LaunchUrl;
}) => {
  const t = useTranslations("Launch");
  const { facts, ready, run } = data;
  if (ready === undefined) {
    return null;
  }
  switch (active) {
    case "sell": {
      return (
        <SellStep
          brand={ready.brand}
          brief={facts.brief}
          key={facts.brief}
          onNext={onBrief}
        />
      );
    }
    case "store": {
      return (
        <StoreStep
          connections={ready.connections}
          onNext={() => onOpen("meta")}
          returnQuery={returnQuery}
        />
      );
    }
    case "meta": {
      return (
        <MetaStep
          onBack={() => onOpen("store")}
          onNext={() => onOpen("design")}
          status={ready}
        />
      );
    }
    case "design": {
      return <DesignStep brief={facts.brief} onRun={onRun} run={run} />;
    }
    case "ads": {
      return run ? (
        <DropFlowCard
          action={t("ads.open")}
          lead={t("ads.lead")}
          run={run.id}
          title={t("ads.title")}
        />
      ) : (
        <div className="flex flex-col gap-6" data-tour="drop-flow">
          <StepHeader lead={t("ads.needsDesign")} title={t("ads.title")} />
          <StepActions>
            <NextButton onClick={() => onOpen("design")}>
              {t("steps.design.title")}
            </NextButton>
          </StepActions>
        </div>
      );
    }
    default: {
      return <FinishedStep run={url.run} />;
    }
  }
};

/**
 * The one guided flow from sign-in to a running campaign, against a
 * 10-minute timer: what to sell, store setup, Meta and guardrails, design
 * approval, ads, then "Here's your campaign". Steps done elsewhere (a
 * provider's consent page, the drop flow) tick off by polling when the
 * merchant comes back. Every step can be skipped.
 */
export const LaunchShell = ({ startedAt }: { startedAt: string }) => {
  const t = useTranslations("Launch");
  const router = useRouter();
  const { push, url } = useLaunchUrl();
  const data = useLaunchFacts(url.run, url.brief);
  const finish = useMutation(orpc.onboarding.finish.mutationOptions());
  const progress: LaunchProgress = launchProgress(data.facts);
  const next = currentStep(progress);
  const active = url.step ?? next;
  const returnQuery = queryOf({ ...url, step: active });

  // Only once the step has rendered, not over the loading skeleton.
  useSpotlight(data.ready === undefined ? undefined : active, {
    close: t("spotlight.close"),
    description: active ? t(`spotlight.${active}`) : "",
    selector: active ? SPOT_SELECTORS[active] : "",
    title: active ? t(`steps.${active}.title`) : "",
  });

  if (data.status.isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (data.status.error) {
    return <FlowProblemNotice problem={describeProblem(data.status.error)} />;
  }
  if (data.ready === undefined) {
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
        </div>
        <LaunchTimer startedAt={startedAt} stoppedAt={launchedAt(data.facts)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <LaunchChecklist
            active={active}
            onOpen={(step) => push({ step })}
            progress={progress}
          />
          <Button
            className="mt-3 w-full"
            disabled={finish.isPending}
            onClick={() =>
              finish.mutate({}, { onSuccess: () => router.push("/dashboard") })
            }
            variant="ghost"
          >
            {t("skip")}
          </Button>
        </aside>
        <section aria-labelledby="wizard-step-title">
          <StepPanel
            active={active}
            data={data}
            onBrief={(brief) => push({ brief, step: "store" })}
            onOpen={(step) => push({ step })}
            onRun={(run) => push({ run, step: "design" })}
            returnQuery={returnQuery}
            url={url}
          />
        </section>
      </div>
    </div>
  );
};
