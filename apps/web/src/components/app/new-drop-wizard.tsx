"use client";

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Label } from "@wovain/ui/components/label";
import { Switch } from "@wovain/ui/components/switch";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useId, useState } from "react";

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
import { describeProblem } from "@/lib/flow-client";
import { client, orpc } from "@/utils/orpc";

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

/** Why a run stopped, when it failed ("" when it gave no reason). */
const failureOf = (run: RunDetail) =>
  run.status === "failed" ? (run.error ?? "") : undefined;

/** The step an opened run picks up at. */
const resumeStep = (run: RunDetail): Step => {
  if (run.status === "completed" || run.status === "failed") {
    return "done";
  }
  return run.designs.length > 0 ? "designs" : "ideas";
};

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
  // A problem the wizard finds itself (not a failed call), shown above the step
  const [notice, setNotice] = useState<FlowProblem>();

  const refreshRuns = () =>
    queryClient.invalidateQueries({ queryKey: orpc.runs.key() });

  // Opened from a run link (/dashboard?run=<id>): pick the run up where it stopped.
  const openedRun = useQuery(
    orpc.runs.get.queryOptions({
      input: initialRunId ? { id: initialRunId } : skipToken,
      retry: false,
    })
  );
  const start = useMutation(
    orpc.runs.start.mutationOptions({ onSettled: refreshRuns })
  );
  const approve = useMutation(orpc.designs.approve.mutationOptions());
  const reject = useMutation(orpc.designs.reject.mutationOptions());
  const publishProduct = useMutation(orpc.products.publish.mutationOptions());
  // These steps act on several items at once, so they take a batch.
  const generate = useMutation({
    mutationFn: (ideaIds: string[]) =>
      Promise.all(ideaIds.map((ideaId) => client.designs.generate({ ideaId }))),
    mutationKey: orpc.designs.generate.mutationKey(),
  });
  const createProducts = useMutation({
    mutationFn: (designIds: string[]) =>
      Promise.all(
        designIds.map((designId) => client.products.create({ designId }))
      ),
    mutationKey: orpc.products.create.mutationKey(),
  });
  const createCampaigns = useMutation({
    mutationFn: ({
      dailyBudget,
      productIds,
    }: {
      dailyBudget: number;
      productIds: string[];
    }) =>
      Promise.all(
        productIds.map((productId) =>
          client.campaigns.create({ dailyBudget, productId })
        )
      ),
    mutationKey: orpc.campaigns.create.mutationKey(),
    onSettled: refreshRuns,
  });
  const mutations = [
    start,
    generate,
    approve,
    reject,
    createProducts,
    publishProduct,
    createCampaigns,
  ];

  const busy: [boolean, Work][] = [
    [start.isPending, start.variables?.autopilot ? "autopilot" : "research"],
    [openedRun.isLoading, "research"],
    [generate.isPending, "designs"],
    [approve.isPending || reject.isPending, "review"],
    [createProducts.isPending, "products"],
    [publishProduct.isPending, "publish"],
    [createCampaigns.isPending, "campaign"],
  ];
  const working = busy.find(([pending]) => pending)?.[1];
  const failedCall = mutations.find((mutation) => mutation.error)?.error;
  const problem =
    notice ?? (failedCall ? describeProblem(failedCall) : undefined);

  /** Replaces the problem above the step (none clears it), including a failed call's. */
  const showProblem = (next?: FlowProblem) => {
    // A call still in flight keeps going and reports when it settles
    for (const mutation of mutations.filter((item) => !item.isPending)) {
      mutation.reset();
    }
    setNotice(next);
  };

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

  const applyRun = (run: RunDetail) => {
    setIdeas(run.ideas);
    setDesigns(run.designs);
    setProducts(run.products);
    setCampaigns(run.campaigns);
    setPicked(run.designs.map((item) => item.ideaId));
  };

  const replaceDesign = (updated: Design) =>
    setDesigns((previous) => replaceById(previous, updated));

  // Seeds the wizard from the opened run once, during render (React's
  // "adjusting state when data changes" pattern); later refetches leave it be.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && openedRun.error) {
    setSeeded(true);
    setNotice(describeProblem(openedRun.error));
  } else if (!seeded && openedRun.data) {
    const run = openedRun.data;
    setSeeded(true);
    applyRun(run);
    setBrief(run.seed);
    setAutopilot(run.autopilot);
    setFailure(failureOf(run));
    setStep(resumeStep(run));
  }

  const submitBrief = () => {
    if (brief.trim().length < MIN_BRIEF) {
      setBriefError(t("brief.error"));
      return;
    }
    if (autopilot && budgetInvalid) {
      return;
    }
    setBriefError(undefined);
    showProblem();
    start.mutate(
      { autopilot, dailyBudget: budgetValue, seed: brief.trim() },
      {
        onSuccess: (run) => {
          applyRun(run);
          if (!autopilot) {
            setStep("ideas");
            return;
          }
          setFailure(failureOf(run));
          setStep("done");
        },
      }
    );
  };

  const designPicked = () => {
    const designed = new Set(designs.map((item) => item.ideaId));
    const todo = picked.filter((ideaId) => !designed.has(ideaId));
    if (todo.length === 0 && designs.length === 0) {
      showProblem({ kind: "other", message: t("trends.error") });
      return;
    }
    showProblem();
    generate.mutate(todo, {
      onSuccess: (made) => {
        setDesigns((previous) => [...previous, ...made]);
        setStep("designs");
      },
    });
  };

  const decide = (design: Design, approved: boolean) => {
    const reason = reasons[design.id];
    showProblem();
    if (approved) {
      approve.mutate({ id: design.id }, { onSuccess: replaceDesign });
      return;
    }
    reject.mutate(reason ? { id: design.id, reason } : { id: design.id }, {
      onSuccess: replaceDesign,
    });
  };

  const retry = (design: Design) => {
    showProblem();
    generate.mutate([design.ideaId], {
      onSuccess: (made) => setDesigns((previous) => [...previous, ...made]),
    });
  };

  const makeProducts = () => {
    const approved = designs.filter((item) => item.status === "approved");
    if (approved.length === 0) {
      showProblem({ kind: "other", message: t("designs.error") });
      return;
    }
    const haveProduct = new Set(products.map((item) => item.designId));
    showProblem();
    createProducts.mutate(
      approved
        .filter((item) => !haveProduct.has(item.id))
        .map((item) => item.id),
      {
        onSuccess: (made) => {
          setProducts((previous) => [...previous, ...made]);
          setStep("products");
        },
      }
    );
  };

  const publish = (product: Product) => {
    showProblem();
    publishProduct.mutate(
      { id: product.id },
      {
        onSuccess: (updated) =>
          setProducts((previous) => replaceById(previous, updated)),
      }
    );
  };

  const buildCampaigns = () => {
    if (budgetInvalid) {
      return;
    }
    const live = products.filter((item) => item.status === "public");
    showProblem();
    createCampaigns.mutate(
      { dailyBudget: budgetValue, productIds: live.map((item) => item.id) },
      {
        onSuccess: (made) => {
          setCampaigns(made);
          setStep("done");
        },
      }
    );
  };

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
    showProblem();
  };

  const goTo = (next: Step) => {
    showProblem();
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
            showProblem({ kind: "other", message: t("products.error") });
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
