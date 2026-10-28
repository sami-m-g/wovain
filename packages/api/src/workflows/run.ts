import { init } from "@mastra/inngest";
import { billingCatalog } from "@wovain/billing/catalog";
import { withLlmTrace } from "@wovain/core/nemotron";
import { stepScorers } from "@wovain/core/step-scorers";
import { NonRetriableError } from "inngest";
import type { Inngest } from "inngest";
import { z } from "zod";

import type { Actor } from "../flow/actor";
import {
  approvedDesigns,
  autopilotRejection,
  autopilotStep,
  awaitApproval,
  awaitIdeas,
  campaignStep,
  designStep,
  finishRun,
  productStep,
  researchStep,
} from "../flow/runs";

// The seller run as a Mastra workflow on Inngest (docs/adr/0001). Inngest
// calls /api/inngest once per step, so no step outlives a Cloud Run request,
// and a step that throws is retried on its own: the steps before it are not
// run again. Each step is safe to run twice (the flow keys its writes), so a
// crash between a provider's answer and the step's checkpoint costs nothing.
//
// The two gates suspend the run: Mastra saves it to Postgres and the Inngest
// function ends, costing nothing while the merchant decides. approveIdeas
// resumes the ideas gate with the ideas to draw ("See designs"), and
// decideDesign the approval gate with the merchant's call.

export const RUN_WORKFLOW_ID = "seller-run";
export const IDEAS_STEP_ID = "ideas";
export const APPROVAL_STEP_ID = "approval";

// The services a step's Actor gets; the merchant comes from the run.
export type RunServices = Omit<Actor, "log" | "runs" | "userId">;

const runInput = z.object({
  autopilot: z.boolean(),
  countries: z.array(z.string()),
  dailyBudget: z.number(),
  seed: z.string(),
});

const trigger = z.object({
  input: runInput,
  runId: z.string(),
  userId: z.string(),
});

// What each step hands the next: lists, since a run draws several designs.
const carry = trigger.extend({
  designIds: z.array(z.string()).optional(),
  // What the last step made, one item per design, for its code scorer
  // (@wovain/core/step-scorers).
  facts: z.array(z.record(z.string(), z.unknown())).optional(),
  ideaIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
});
type Carry = z.infer<typeof carry>;

// The ideas the merchant approved: the only ones the run draws.
const chosenIdeas = z.object({ ideaIds: z.array(z.string()).min(1) });

const decision = z.object({
  approve: z.boolean(),
  reason: z.string().optional(),
});

// A step's code scorer, run on every step (code checks cost nothing).
const scored = (id: keyof typeof stepScorers) => ({
  [id]: {
    sampling: { rate: 1, type: "ratio" as const },
    scorer: stepScorers[id],
  },
});

const RETRIES = 3;
const RETRY_DELAY_MS = 5000;
// Inngest re-invokes the whole function (memoized steps skip) with its own
// exponential backoff when an invocation dies: a crash, a timeout, a deploy.
const FUNCTION_RETRIES = 4;
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

// A 4xx (over quota, not connected, not approved, a guarded move) won't pass
// on a retry: fail the step now. Anything else is retried.
const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : undefined;

export const isPermanent = (error: unknown) => {
  const status = statusOf(error);
  return (
    status !== undefined && status >= CLIENT_ERROR && status < SERVER_ERROR
  );
};

const permanentOrRetried = (error: unknown) => {
  if (isPermanent(error)) {
    return new NonRetriableError(
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
  return error;
};

export const createRunWorkflow = (inngest: Inngest, services: RunServices) => {
  const { createStep, createWorkflow } = init(inngest);
  const actorFor = (userId: string): Actor => ({ ...services, userId });

  // Runs a step's body for the run's merchant, inside the run's LLM trace.
  const body =
    <T>(work: (actor: Actor, from: Carry) => Promise<T>) =>
    async (from: Carry) => {
      try {
        return await withLlmTrace(
          { distinctId: from.userId, traceId: from.runId },
          async () => await work(actorFor(from.userId), from)
        );
      } catch (error) {
        throw permanentOrRetried(error);
      }
    };

  const research = createStep({
    execute: async ({ bail, inputData }) => {
      const found = await body(
        async (actor, from) => await researchStep(actor, from.runId, from.input)
      )(inputData);
      if (found.ideaIds.length === 0) {
        await finishRun(actorFor(inputData.userId), inputData.runId, {
          error: "Research found no ideas for this seed.",
          status: "failed",
        });
        return bail(inputData);
      }
      return { ...inputData, ideaIds: found.ideaIds };
    },
    id: "research",
    inputSchema: trigger,
    outputSchema: carry,
    retries: RETRIES,
  });

  // The ideas gate. Autopilot goes on with the ideas research ranked behind
  // its pick: the merchant turned it on to make this call. A merchant's run
  // suspends with nothing drawn, and goes on with only the ideas they
  // approved.
  const ideas = createStep({
    execute: async ({ inputData, resumeData, suspend }) => {
      if (inputData.input.autopilot) {
        return inputData;
      }
      if (resumeData === undefined) {
        await awaitIdeas(actorFor(inputData.userId), inputData.runId);
        return await suspend({ ideaIds: inputData.ideaIds ?? [] });
      }
      return { ...inputData, ideaIds: resumeData.ideaIds };
    },
    id: IDEAS_STEP_ID,
    inputSchema: carry,
    outputSchema: carry,
    resumeSchema: chosenIdeas,
    retries: RETRIES,
    suspendSchema: z.object({ ideaIds: z.array(z.string()) }),
  });

  const design = createStep({
    execute: async ({ inputData }) => {
      const drafted = await body(
        async (actor, from) =>
          await designStep(actor, from.runId, from.ideaIds ?? [])
      )(inputData);
      return {
        ...inputData,
        designIds: drafted.designIds,
        facts: drafted.facts,
      };
    },
    id: "design",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
    scorers: scored("design_facts"),
  });

  // The gate. Autopilot decides each design; a merchant's run suspends until
  // the call on its last pending design resumes it, then goes on with every
  // design the merchant approved (read from the database: they decide one
  // design at a time, and may have drawn more while the run waited).
  const approval = createStep({
    execute: async ({ bail, inputData, resumeData, suspend }) => {
      const actor = actorFor(inputData.userId);
      const { runId } = inputData;
      if (inputData.input.autopilot) {
        const decided = await body(
          async (as, from) =>
            await autopilotStep(as, from.runId, from.designIds ?? [])
        )(inputData);
        if (decided.approvedIds.length === 0) {
          await finishRun(actor, runId, {
            error: autopilotRejection(decided.reasons),
            status: "failed",
          });
          return bail(inputData);
        }
        return { ...inputData, designIds: decided.approvedIds };
      }
      if (resumeData === undefined && (await awaitApproval(actor, runId))) {
        return await suspend({ designIds: inputData.designIds ?? [] });
      }
      const approvedIds = await approvedDesigns(actor, runId);
      if (approvedIds.length === 0) {
        // The merchant rejected every design: the run is done.
        await finishRun(actor, runId, { status: "completed" });
        return bail(inputData);
      }
      return { ...inputData, designIds: approvedIds };
    },
    id: APPROVAL_STEP_ID,
    inputSchema: carry,
    outputSchema: carry,
    resumeSchema: decision,
    retries: RETRIES,
    suspendSchema: z.object({ designIds: z.array(z.string()) }),
  });

  const product = createStep({
    execute: async ({ inputData }) => {
      const made = await body(
        async (actor, from) =>
          await productStep(actor, from.runId, from.designIds ?? [])
      )(inputData);
      return { ...inputData, facts: made.facts, productIds: made.productIds };
    },
    id: "product",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
    scorers: scored("price_floor"),
  });

  const campaign = createStep({
    execute: async ({ inputData }) => {
      const staged = await body(async (actor, from) => {
        const made = await campaignStep(actor, from.runId, {
          input: from.input,
          productIds: from.productIds ?? [],
        });
        await finishRun(actor, from.runId, { status: "completed" });
        return made;
      })(inputData);
      return { ...inputData, facts: staged.facts };
    },
    id: "campaign",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
    scorers: scored("ad_copy_lengths"),
  });

  return (
    createWorkflow({
      // One merchant can't flood the queue; others' runs go on.
      concurrency: {
        key: "event.data.resourceId",
        limit: billingCatalog().runsPerMerchant,
      },
      id: RUN_WORKFLOW_ID,
      inputSchema: trigger,
      options: {
        // On Inngest this runs in the workflow's memoized finalize step.
        onError: async ({ error, getInitData }) => {
          const { runId, userId } = trigger.parse(getInitData());
          await finishRun(actorFor(userId), runId, {
            cause: error,
            error: error?.message ?? "The run failed",
            status: "failed",
          });
        },
      },
      outputSchema: carry,
      retries: FUNCTION_RETRIES,
      retryConfig: { attempts: RETRIES, delay: RETRY_DELAY_MS },
    })
      /* oxlint-disable promise/prefer-await-to-then -- Mastra's step builder, not a promise */
      .then(research)
      .then(ideas)
      .then(design)
      .then(approval)
      .then(product)
      .then(campaign)
      /* oxlint-enable promise/prefer-await-to-then */
      .commit()
  );
};

export type RunWorkflow = ReturnType<typeof createRunWorkflow>;
