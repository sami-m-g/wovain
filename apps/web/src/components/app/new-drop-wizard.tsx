"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Label } from "@wovain/ui/components/label";
import { Switch } from "@wovain/ui/components/switch";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { STEP_TITLE_ID } from "@/components/app/wizard-parts";
import {
  BriefStep,
  CampaignStep,
  DesignsStep,
  DoneStep,
  IdeasStep,
  ProductsStep,
} from "@/components/app/wizard-steps";
import type { Stage } from "@/components/product/run-tape";
import { RunTape, STAGE_COUNT } from "@/components/product/run-tape";
import type {
  Campaign,
  Design,
  FlowProblem,
  Idea,
  Product,
  RunDetail,
} from "@/lib/flow-client";
import { describeProblem, flowClient } from "@/lib/flow-client";

type Step = "brief" | "ideas" | "designs" | "products" | "campaign" | "done";
type Work =
  | "research"
  | "autopilot"
  | "designs"
  | "review"
  | "products"
  | "publish"
  | "campaign";

const STEPS: Step[] = [
  "brief",
  "ideas",
  "designs",
  "products",
  "campaign",
  "done",
];
const STEP_STAGE: Record<Step, Stage> = {
  brief: "brief",
  campaign: "campaign",
  designs: "designs",
  done: "campaign",
  ideas: "trends",
  products: "products",
};

const MIN_BRIEF = 10;
const MIN_BUDGET = 1;
const MAX_BUDGET = 500;
const DEFAULT_BUDGET = 15;

const replaceById = <T extends { id: string }>(items: T[], next: T) =>
  items.map((item) => (item.id === next.id ? next : item));

export const NewDropWizard = ({
  initialBrief,
  initialRunId,
}: {
  initialBrief: string;
  initialRunId?: string | undefined;
}) => {
  const t = useTranslations("Wizard");
  const stages = useTranslations("Stages");
  const queryClient = useQueryClient();
  const switchId = useId();

  const [step, setStep] = useState<Step>("brief");
  const [autopilot, setAutopilot] = useState(false);
  const [brief, setBrief] = useState(initialBrief);
  const [briefError, setBriefError] = useState<string>();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [failure, setFailure] = useState<string>();
  const [budget, setBudget] = useState(String(DEFAULT_BUDGET));
  const [working, setWorking] = useState<Work>();
  const [problem, setProblem] = useState<FlowProblem>();

  const stepIndex = STEPS.indexOf(step);
  const busyLabel = working ? t(`working.${working}`) : undefined;
  const budgetValue = Number(budget);
  const budgetInvalid =
    !Number.isFinite(budgetValue) ||
    budgetValue < MIN_BUDGET ||
    budgetValue > MAX_BUDGET;
  const titles = Object.fromEntries(
    designs.map((item) => [item.id, item.brief.title])
  );

  /** Runs one unit of work with a busy state; problems show above the step. */
  const perform = async <T,>(work: Work, task: () => Promise<T>) => {
    setProblem(undefined);
    setWorking(work);
    let result: T | undefined;
    try {
      result = await task();
    } catch (error) {
      setProblem(describeProblem(error));
    }
    setWorking(undefined);
    return result;
  };

  const refreshRuns = () =>
    queryClient.invalidateQueries({ queryKey: ["runs"] });

  const applyRun = (run: RunDetail) => {
    setIdeas(run.ideas);
    setDesigns(run.designs);
    setProducts(run.products);
    setCampaigns(run.campaigns);
    setPicked(run.designs.map((item) => item.ideaId));
  };

  const submitBrief = async () => {
    if (brief.trim().length < MIN_BRIEF) {
      setBriefError(t("brief.error"));
      return;
    }
    if (autopilot && budgetInvalid) {
      return;
    }
    setBriefError(undefined);
    const run = await perform(autopilot ? "autopilot" : "research", () =>
      flowClient.runs.start({
        autopilot,
        dailyBudget: budgetValue,
        seed: brief.trim(),
      })
    );
    await refreshRuns();
    if (!run) {
      return;
    }
    applyRun(run);
    if (!autopilot) {
      setStep("ideas");
      return;
    }
    setFailure(run.status === "failed" ? (run.error ?? "") : undefined);
    setStep("done");
  };

  const designPicked = async () => {
    const designed = new Set(designs.map((item) => item.ideaId));
    const todo = picked.filter((ideaId) => !designed.has(ideaId));
    if (todo.length === 0 && designs.length === 0) {
      setProblem({ kind: "other", message: t("trends.error") });
      return;
    }
    const made = await perform("designs", () =>
      Promise.all(todo.map((ideaId) => flowClient.designs.generate(ideaId)))
    );
    if (made) {
      setDesigns((previous) => [...previous, ...made]);
      setStep("designs");
    }
  };

  const decide = async (design: Design, approve: boolean) => {
    const updated = await perform("review", () =>
      approve
        ? flowClient.designs.approve(design.id)
        : flowClient.designs.reject(design.id, reasons[design.id])
    );
    if (updated) {
      setDesigns((previous) => replaceById(previous, updated));
    }
  };

  const retry = async (design: Design) => {
    const made = await perform("designs", () =>
      flowClient.designs.generate(design.ideaId)
    );
    if (made) {
      setDesigns((previous) => [...previous, made]);
    }
  };

  const makeProducts = async () => {
    const approved = designs.filter((item) => item.status === "approved");
    if (approved.length === 0) {
      setProblem({ kind: "other", message: t("designs.error") });
      return;
    }
    const haveProduct = new Set(products.map((item) => item.designId));
    const made = await perform("products", () =>
      Promise.all(
        approved
          .filter((item) => !haveProduct.has(item.id))
          .map((design) => flowClient.products.create(design.id))
      )
    );
    if (made) {
      setProducts((previous) => [...previous, ...made]);
      setStep("products");
    }
  };

  const publish = async (product: Product) => {
    const updated = await perform("publish", () =>
      flowClient.products.publish(product.id)
    );
    if (updated) {
      setProducts((previous) => replaceById(previous, updated));
    }
  };

  const buildCampaigns = async () => {
    if (budgetInvalid) {
      return;
    }
    const live = products.filter((item) => item.status === "public");
    const made = await perform("campaign", () =>
      Promise.all(
        live.map((product) =>
          flowClient.campaigns.create({
            dailyBudget: budgetValue,
            productId: product.id,
          })
        )
      )
    );
    await refreshRuns();
    if (made) {
      setCampaigns(made);
      setStep("done");
    }
  };

  // Opened from a run link (/dashboard?run=<id>): pick the run up where it stopped.
  const openRun = async (runId: string) => {
    const run = await perform("research", () => flowClient.runs.get(runId));
    if (!run) {
      return;
    }
    applyRun(run);
    setBrief(run.seed);
    setAutopilot(run.autopilot);
    if (run.status === "completed" || run.status === "failed") {
      setFailure(run.status === "failed" ? (run.error ?? "") : undefined);
      setStep("done");
      return;
    }
    setStep(run.designs.length > 0 ? "designs" : "ideas");
  };

  const opened = useRef(false);
  useEffect(() => {
    if (initialRunId && !opened.current) {
      opened.current = true;
      openRun(initialRunId);
    }
  });

  const restart = () => {
    setStep("brief");
    setBrief("");
    setIdeas([]);
    setPicked([]);
    setDesigns([]);
    setReasons({});
    setProducts([]);
    setCampaigns([]);
    setFailure(undefined);
    setProblem(undefined);
  };

  const goTo = (next: Step) => {
    setProblem(undefined);
    setStep(next);
  };

  const panels: Record<Step, ReactNode> = {
    brief: (
      <BriefStep
        autopilot={autopilot}
        brief={brief}
        budget={budget}
        budgetInvalid={budgetInvalid}
        busyLabel={busyLabel}
        error={briefError}
        onBudget={setBudget}
        onChange={setBrief}
        onSubmit={submitBrief}
      />
    ),
    campaign: (
      <CampaignStep
        budget={budget}
        budgetInvalid={budgetInvalid}
        busyLabel={busyLabel}
        onBack={() => goTo("products")}
        onBudget={setBudget}
        onNext={buildCampaigns}
      />
    ),
    designs: (
      <DesignsStep
        busyLabel={busyLabel}
        designs={designs}
        onApprove={(design) => decide(design, true)}
        onBack={() => goTo("ideas")}
        onNext={makeProducts}
        onReason={(id, value) =>
          setReasons((previous) => ({ ...previous, [id]: value }))
        }
        onReject={(design) => decide(design, false)}
        onRetry={retry}
        reasons={reasons}
      />
    ),
    done: (
      <DoneStep campaigns={campaigns} failure={failure} onRestart={restart} />
    ),
    ideas: (
      <IdeasStep
        busyLabel={busyLabel}
        designedIdeaIds={designs.map((item) => item.ideaId)}
        ideas={ideas}
        onNext={designPicked}
        onToggle={(id, checked) =>
          setPicked((previous) =>
            checked ? [...previous, id] : previous.filter((item) => item !== id)
          )
        }
        picked={picked}
      />
    ),
    products: (
      <ProductsStep
        busyLabel={busyLabel}
        onNext={() => {
          if (products.some((item) => item.status === "public")) {
            goTo("campaign");
          } else {
            setProblem({ kind: "other", message: t("products.error") });
          }
        }}
        onPublish={publish}
        products={products}
        titles={titles}
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
        <div className="border-border bg-card flex max-w-sm items-start gap-3 rounded-xl border p-4">
          <Switch
            aria-describedby={`${switchId}-hint`}
            checked={autopilot}
            className="mt-0.5"
            disabled={step !== "brief" || Boolean(working)}
            id={switchId}
            onCheckedChange={setAutopilot}
          />
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium" htmlFor={switchId}>
              <Bot aria-hidden="true" className="size-4" />
              {t("autopilot")}
            </Label>
            <p
              className="text-muted-foreground text-xs"
              id={`${switchId}-hint`}
            >
              {t("autopilotHint")}
            </p>
          </div>
        </div>
      </div>

      <nav aria-label={t("stepsLabel")} className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs font-medium">
          {t("stepOf", {
            current: Math.min(stepIndex + 1, STAGE_COUNT),
            total: STAGE_COUNT,
          })}
        </p>
        <RunTape finished={step === "done"} stage={STEP_STAGE[step]} />
        <ol className="sr-only">
          {STEPS.map((item, index) => (
            <li aria-current={item === step ? "step" : undefined} key={item}>
              {stages(STEP_STAGE[item])}
              {index < stepIndex ? ` (${stages("done")})` : ""}
            </li>
          ))}
        </ol>
      </nav>

      <output aria-live="polite" className="sr-only">
        {busyLabel}
      </output>

      {working === "autopilot" ? (
        <Alert>
          <Bot aria-hidden="true" />
          <AlertDescription className="text-foreground text-sm">
            {t("autopilotRunning")}
          </AlertDescription>
        </Alert>
      ) : null}

      {problem ? <FlowProblemNotice problem={problem} /> : null}

      <section
        aria-labelledby={STEP_TITLE_ID}
        className="border-border bg-card rounded-2xl border p-5 sm:p-8"
      >
        {panels[step]}
      </section>
    </div>
  );
};
