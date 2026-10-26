"use client";

import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@wovain/ui/components/field";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Switch } from "@wovain/ui/components/switch";
import { Bot } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useId } from "react";

import { FlowProblemNotice } from "@/components/app/flow-problem";
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

const AutopilotToggle = ({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) => {
  const t = useTranslations("Wizard");
  const id = useId();
  return (
    <Field
      className="border-border bg-card max-w-sm rounded-xl border p-4"
      data-disabled={disabled || undefined}
      orientation="horizontal"
    >
      <Switch
        aria-describedby={`${id}-hint`}
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onChange}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>
          <Bot aria-hidden="true" className="size-4" />
          {t("autopilot")}
        </FieldLabel>
        <FieldDescription className="text-xs" id={`${id}-hint`}>
          {t("autopilotHint")}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
};

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
        failure={run ? failureOf(run) : undefined}
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
          onChange={drop.handleAutopilot}
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

      {drop.problem ? <FlowProblemNotice problem={drop.problem} /> : null}

      {/* Each step settles into place as it replaces the last (preventing a
          jarring change); MotionConfig keeps only the fade for reduced motion. */}
      <motion.section
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        aria-labelledby={STEP_TITLE_ID}
        className="border-border bg-card rounded-2xl border p-5 sm:p-8"
        initial={{ opacity: 0, transform: "translateY(8px)" }}
        key={drop.loading ? "loading" : step}
      >
        {drop.loading ? <PanelSkeleton /> : panels[step]}
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
