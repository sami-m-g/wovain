"use client";

import { defineStepper } from "@stepperize/react/headless";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { Stage } from "@/components/product/run-tape";
import type { FlowProblem, RunDetail } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { client, orpc } from "@/utils/orpc";

/**
 * The drop flow's steps. Stepperize owns which step is current; the step is
 * mirrored in the URL (?run=…&step=…) so a refresh, a run email link or the
 * browser's back button land on the same step.
 */
export const flow = defineStepper([
  { id: "brief", stage: "brief" },
  { id: "ideas", stage: "trends" },
  { id: "designs", stage: "designs" },
  { id: "products", stage: "products" },
  { id: "campaign", stage: "campaign" },
  { id: "done", stage: "campaign" },
] as const satisfies readonly { id: string; stage: Stage }[]);

export type Step = (typeof flow.steps)[number]["id"];
type Work =
  | "research"
  | "autopilot"
  | "designs"
  | "review"
  | "products"
  | "publish"
  | "campaign";

const MIN_BRIEF = 10;
const MIN_BUDGET = 1;
const MAX_BUDGET = 500;
const DEFAULT_BUDGET = 15;

/** Why a run stopped, when it failed ("" when it gave no reason). */
export const failureOf = (run: RunDetail) =>
  run.status === "failed" ? (run.error ?? "") : undefined;

/** The step an opened run picks up at. */
const resumeStep = (run?: RunDetail): Step => {
  if (!run) {
    return "brief";
  }
  if (run.status === "completed" || run.status === "failed") {
    return "done";
  }
  if (run.products.length > 0) {
    return "products";
  }
  return run.designs.length > 0 ? "designs" : "ideas";
};

const replaceById = <T extends { id: string }>(items: T[], next: T) =>
  items.map((item) => (item.id === next.id ? next : item));

const appendNew = <T extends { id: string }>(items: T[], added: T[]) => {
  const known = new Set(items.map((item) => item.id));
  return [...items, ...added.filter((item) => !known.has(item.id))];
};

/**
 * Writes the flow's place into the URL without a server round trip; Next.js
 * keeps `useSearchParams` in sync with the History API.
 */
const pushFlowUrl = (query: { run?: string | undefined; step?: Step }) => {
  const params = new URLSearchParams();
  if (query.run) {
    params.set("run", query.run);
  }
  if (query.step && query.step !== "brief") {
    params.set("step", query.step);
  }
  const search = params.toString();
  window.history.pushState(
    null,
    "",
    search ? `?${search}` : window.location.pathname
  );
};

/**
 * The run as the TanStack Query cache holds it: the single store for what
 * the run produced (ideas, designs, products, campaigns). Mutations write
 * their results back here, never into component state.
 */
const useRunCache = (runId: string | undefined) => {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.runs.get.queryOptions({
      input: runId ? { id: runId } : skipToken,
      retry: false,
    })
  );
  const key = orpc.runs.get.queryKey({ input: { id: runId ?? "" } });
  return {
    loadError: query.error,
    loading: Boolean(runId) && query.isPending && !query.error,
    patch: (update: (current: RunDetail) => RunDetail) => {
      queryClient.setQueryData(key, (current) =>
        current ? update(current) : current
      );
    },
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
    refreshList: () =>
      queryClient.invalidateQueries({ queryKey: orpc.runs.key() }),
    run: query.data,
    seed: (run: RunDetail) =>
      queryClient.setQueryData(
        orpc.runs.get.queryKey({ input: { id: run.id } }),
        run
      ),
  };
};

const useFlowMutations = (refreshList: () => Promise<void>) => {
  const start = useMutation(
    orpc.runs.start.mutationOptions({ onSettled: refreshList })
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
    onSettled: refreshList,
  });
  const all = [
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
    [generate.isPending, "designs"],
    [approve.isPending || reject.isPending, "review"],
    [createProducts.isPending, "products"],
    [publishProduct.isPending, "publish"],
    [createCampaigns.isPending, "campaign"],
  ];
  return {
    approve,
    createCampaigns,
    createProducts,
    failed: all.find((mutation) => mutation.error)?.error,
    generate,
    publishProduct,
    reject,
    /** Clears settled calls' errors; one still in flight reports when it settles. */
    resetSettled: () => {
      for (const mutation of all.filter((item) => !item.isPending)) {
        mutation.reset();
      }
    },
    start,
    working: busy.find(([pending]) => pending)?.[1],
  };
};

/** Everything the new-drop flow shows and does, for one run (or none yet). */
export const useDropFlow = (
  runId: string | undefined,
  initialBrief: string
) => {
  const t = useTranslations("Wizard");
  const searchParams = useSearchParams();
  const cache = useRunCache(runId);
  const calls = useFlowMutations(cache.refreshList);
  const { run } = cache;

  // Inputs and choices the merchant hasn't sent yet: the only local state.
  const [autopilotDraft, setAutopilotDraft] = useState(false);
  const [brief, setBrief] = useState(initialBrief);
  const [briefError, setBriefError] = useState<string>();
  const [picked, setPicked] = useState<string[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState(String(DEFAULT_BUDGET));
  // A problem the flow finds itself (not a failed call), shown above the step
  const [notice, setNotice] = useState<FlowProblem>();

  const fallback = resumeStep(run);
  const stepper = flow.useStepper({
    onInvalidStep: () => pushFlowUrl({ run: runId, step: fallback }),
    onStepChange: (next) => pushFlowUrl({ run: runId, step: next }),
    // Without a run there is nothing past the brief.
    step: runId ? (searchParams.get("step") ?? fallback) : "brief",
  });

  const designs = run?.designs ?? [];
  const products = run?.products ?? [];
  const autopilot = run?.autopilot ?? autopilotDraft;
  const budgetValue = Number(budget);
  const budgetInvalid =
    !Number.isFinite(budgetValue) ||
    budgetValue < MIN_BUDGET ||
    budgetValue > MAX_BUDGET;

  let problem = notice;
  if (!problem && calls.failed) {
    problem = describeProblem(calls.failed);
  } else if (!problem && cache.loadError) {
    problem = describeProblem(cache.loadError);
  }

  /** Replaces the problem above the step (none clears it), including a failed call's. */
  const showProblem = (next?: FlowProblem) => {
    calls.resetSettled();
    setNotice(next);
  };

  const addDesigns = (made: RunDetail["designs"]) =>
    cache.patch((current) => ({
      ...current,
      designs: appendNew(current.designs, made),
    }));
  const replaceDesign = (updated: RunDetail["designs"][number]) =>
    cache.patch((current) => ({
      ...current,
      designs: replaceById(current.designs, updated),
    }));

  const actions = {
    /** Approves or rejects one design, with the merchant's reason if given. */
    handleDecide: (id: string, approved: boolean) => {
      const reason = reasons[id];
      showProblem();
      if (approved) {
        calls.approve.mutate({ id }, { onSuccess: replaceDesign });
        return;
      }
      calls.reject.mutate(reason ? { id, reason } : { id }, {
        onSuccess: replaceDesign,
      });
    },
    handleDesignPicked: () => {
      const designed = new Set(designs.map((item) => item.ideaId));
      const todo = picked.filter((ideaId) => !designed.has(ideaId));
      if (todo.length === 0 && designs.length === 0) {
        showProblem({ kind: "other", message: t("trends.error") });
        return;
      }
      showProblem();
      calls.generate.mutate(todo, {
        onSuccess: (made) => {
          addDesigns(made);
          stepper.goTo("designs");
        },
      });
    },
    handleGoTo: (next: Step) => {
      showProblem();
      stepper.goTo(next);
    },
    handleMakeCampaigns: () => {
      if (budgetInvalid) {
        return;
      }
      const live = products.filter((item) => item.status === "public");
      showProblem();
      calls.createCampaigns.mutate(
        { dailyBudget: budgetValue, productIds: live.map((item) => item.id) },
        {
          onSuccess: async (made) => {
            cache.patch((current) => ({
              ...current,
              campaigns: appendNew(current.campaigns, made),
            }));
            stepper.goTo("done");
            // The run's status moves on the server too.
            await cache.refetch();
          },
        }
      );
    },
    handleMakeProducts: () => {
      const approved = designs.filter((item) => item.status === "approved");
      if (approved.length === 0) {
        showProblem({ kind: "other", message: t("designs.error") });
        return;
      }
      const haveProduct = new Set(products.map((item) => item.designId));
      showProblem();
      calls.createProducts.mutate(
        approved
          .filter((item) => !haveProduct.has(item.id))
          .map((item) => item.id),
        {
          onSuccess: (made) => {
            cache.patch((current) => ({
              ...current,
              products: appendNew(current.products, made),
            }));
            stepper.goTo("products");
          },
        }
      );
    },
    handleProductsDone: () => {
      if (products.some((item) => item.status === "public")) {
        actions.handleGoTo("campaign");
        return;
      }
      showProblem({ kind: "other", message: t("products.error") });
    },
    handlePublish: (id: string) => {
      showProblem();
      calls.publishProduct.mutate(
        { id },
        {
          onSuccess: (updated) =>
            cache.patch((current) => ({
              ...current,
              products: replaceById(current.products, updated),
            })),
        }
      );
    },
    handleReason: (id: string, value: string) =>
      setReasons((previous) => ({ ...previous, [id]: value })),
    /** "Start another drop": a bare URL remounts the flow from scratch. */
    handleRestart: () => pushFlowUrl({}),
    handleRetry: (ideaId: string) => {
      showProblem();
      calls.generate.mutate([ideaId], { onSuccess: addDesigns });
    },
    handleSubmitBrief: () => {
      if (brief.trim().length < MIN_BRIEF) {
        setBriefError(t("brief.error"));
        return;
      }
      if (autopilot && budgetInvalid) {
        return;
      }
      setBriefError(undefined);
      showProblem();
      calls.start.mutate(
        { autopilot, dailyBudget: budgetValue, seed: brief.trim() },
        {
          onSuccess: (started) => {
            cache.seed(started);
            // The flow remounts on the run and reads it from the cache.
            pushFlowUrl({
              run: started.id,
              step: autopilot ? "done" : "ideas",
            });
          },
        }
      );
    },
    handleToggleIdea: (id: string, checked: boolean) =>
      setPicked((previous) =>
        checked ? [...previous, id] : previous.filter((item) => item !== id)
      ),
  };

  return {
    actions,
    autopilot,
    brief,
    briefError,
    budget,
    budgetInvalid,
    busyLabel: calls.working ? t(`working.${calls.working}`) : undefined,
    handleAutopilot: setAutopilotDraft,
    handleBrief: setBrief,
    handleBudget: setBudget,
    loading: cache.loading,
    picked,
    problem,
    reasons,
    run,
    step: stepper.current,
    working: calls.working,
  };
};
