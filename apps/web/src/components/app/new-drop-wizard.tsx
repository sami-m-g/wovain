"use client";

import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Bot } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { AutopilotToggle } from "@/components/app/autopilot-toggle";
import { FlowProblemNotice } from "@/components/app/flow-problem";
import { NoIdeasState, RunFailedState } from "@/components/app/run-failed";
import type { Step } from "@/components/app/use-drop-flow";
import { failureOf, flow, useDropFlow } from "@/components/app/use-drop-flow";
import { STEP_TITLE_ID } from "@/components/app/wizard-parts";
import {
  BriefStep,
  CampaignStep,
  DesignsStep,
  DoneStep,
  IdeasStep,
  MAX_BRIEF,
  ProductsStep,
} from "@/components/app/wizard-steps";
import type { Stage } from "@/components/product/run-tape";
import { RunTape, STAGE_COUNT } from "@/components/product/run-tape";
import { describeRunFailure } from "@/lib/flow-client";

const StepNav = ({ step, stage }: { step: Step; stage: Stage }) => {
  const t = useTranslations("Wizard");
  const stages = useTranslations("Stages");
  const index = flow.steps.findIndex((item) => item.id === step);
  return (
    <nav aria-label={t("stepsLabel")} className="flex flex-col gap-3">
      <p className="text-muted-foreground figures text-xs font-medium">
        {t("stepOf", {
          current: Math.min(index + 1, STAGE_COUNT),
          total: STAGE_COUNT,
        })}
      </p>
      <RunTape finished={step === "done"} stage={stage} />
      <ol className="sr-only">
        {flow.steps.map((item, position) => (
          <li
            aria-current={item.id === step ? "step" : undefined}
            key={item.id}
          >
            {stages(item.stage)}
            {position < index ? ` (${stages("done")})` : ""}
          </li>
        ))}
      </ol>
    </nav>
  );
};

const PanelSkeleton = () => {
  const t = useTranslations("Wizard");
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" id={STEP_TITLE_ID}>
        {t("working.research")}
      </span>
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
};

type Drop = ReturnType<typeof useDropFlow>;

/**
 * The step's panel, unless the run says otherwise: a failed run, or research
 * that came back empty, never leaves the wizard on an empty step. The
 * merchant sees what happened and what to do next.
 */
const RunStatePanel = ({
  children,
  drop,
  step,
}: {
  children: ReactNode;
  drop: Drop;
  step: Step;
}) => {
  const { actions, run, starting } = drop;
  const failedAt = run ? failureOf(run) : undefined;
  if (run && failedAt) {
    return (
      <RunFailedState
        failure={describeRunFailure(run)}
        onRestart={actions.handleRestart}
        onRetry={actions.handleRetryRun}
        retrying={starting}
        stage={failedAt}
      />
    );
  }
  if (step !== "ideas" || !run || run.ideas.length > 0) {
    return children;
  }
  return run.status === "running" ? (
    <PanelSkeleton />
  ) : (
    <NoIdeasState
      onRestart={actions.handleRestart}
      onRetry={actions.handleRetryRun}
      retrying={starting}
    />
  );
};

const DropFlow = ({
  runId,
  initialBrief,
}: {
  runId?: string | undefined;
  initialBrief: string;
}) => {
  const t = useTranslations("Wizard");
  const drop = useDropFlow(runId, initialBrief);
  const { actions, busyLabel, run } = drop;
  const designs = run?.designs ?? [];
  const step = drop.step.id;

  const panels: Record<Step, ReactNode> = {
    brief: (
      <BriefStep
        autopilot={drop.autopilot}
        brief={drop.brief}
        budget={drop.budget}
        budgetInvalid={drop.budgetInvalid}
        busyLabel={busyLabel}
        error={drop.briefError}
        onBudget={drop.handleBudget}
        onChange={drop.handleBrief}
        onSubmit={actions.handleSubmitBrief}
      />
    ),
    campaign: (
      <CampaignStep
        budget={drop.budget}
        budgetInvalid={drop.budgetInvalid}
        busyLabel={busyLabel}
        onBack={() => actions.handleGoTo("products")}
        onBudget={drop.handleBudget}
        onNext={actions.handleMakeCampaigns}
      />
    ),
    designs: (
      <DesignsStep
        busyLabel={busyLabel}
        designs={designs}
        onApprove={(design) => actions.handleDecide(design.id, true)}
        onBack={() => actions.handleGoTo("ideas")}
        onNext={actions.handleMakeProducts}
        onReason={actions.handleReason}
        onReject={(design) => actions.handleDecide(design.id, false)}
        onRetry={(design) => actions.handleRetry(design.ideaId)}
        reasons={drop.reasons}
      />
    ),
    done: (
      <DoneStep
        campaigns={run?.campaigns ?? []}
        onRestart={actions.handleRestart}
      />
    ),
    ideas: (
      <IdeasStep
        busyLabel={busyLabel}
        designedIdeaIds={designs.map((item) => item.ideaId)}
        ideas={run?.ideas ?? []}
        onNext={actions.handleDesignPicked}
        onToggle={actions.handleToggleIdea}
        picked={drop.picked}
      />
    ),
    products: (
      <ProductsStep
        busyLabel={busyLabel}
        onNext={actions.handleProductsDone}
        onPublish={(product) => actions.handlePublish(product.id)}
        products={run?.products ?? []}
        titles={Object.fromEntries(
          designs.map((item) => [item.id, item.brief.title])
        )}
      />
    ),
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
        </div>
        <AutopilotToggle
          checked={drop.autopilot}
          disabled={step !== "brief" || Boolean(drop.working)}
          onCheckedChange={drop.handleAutopilot}
        />
      </div>

      <StepNav stage={drop.step.stage} step={step} />

      <output aria-live="polite" className="sr-only">
        {busyLabel}
      </output>

      {drop.working === "autopilot" ? (
        <Alert>
          <Bot aria-hidden="true" />
          <AlertDescription className="text-foreground text-sm">
            {t("autopilotRunning")}
          </AlertDescription>
        </Alert>
      ) : null}

      {drop.problem ? (
        <FlowProblemNotice
          onDismiss={drop.handleDismissProblem}
          problem={drop.problem}
        />
      ) : null}

      {/* Each step settles into place as it replaces the last (preventing a
          jarring change); MotionConfig keeps only the fade for reduced motion. */}
      <motion.section
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        aria-labelledby={STEP_TITLE_ID}
        className="border-border bg-card rounded-2xl border p-5 sm:p-8"
        initial={{ opacity: 0, transform: "translateY(8px)" }}
        key={drop.loading ? "loading" : step}
      >
        {drop.loading ? (
          <PanelSkeleton />
        ) : (
          <RunStatePanel drop={drop} step={step}>
            {panels[step]}
          </RunStatePanel>
        )}
      </motion.section>
    </div>
  );
};

/**
 * The new-drop flow. It remounts per run (`key`), so starting a run or
 * "Start another drop" begins from a clean slate without resetting state by
 * hand.
 */
export const NewDropWizard = () => {
  const searchParams = useSearchParams();
  const runId = searchParams.get("run") ?? undefined;
  const initialBrief = (searchParams.get("brief") ?? "").slice(0, MAX_BRIEF);
  return (
    <DropFlow initialBrief={initialBrief} key={runId ?? "new"} runId={runId} />
  );
};
