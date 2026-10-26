import { init } from "@mastra/inngest";
import { withLlmTrace } from "@wovain/core/nemotron";
import { NonRetriableError } from "inngest";
import type { Inngest } from "inngest";
import { z } from "zod";

import type { Actor } from "../flow/actor";
import {
  autopilotStep,
  awaitApproval,
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
// The approval gate suspends the run: Mastra saves it to Postgres and the
// Inngest function ends, costing nothing while the merchant decides.
// decideDesign resumes it with the merchant's call.

export const RUN_WORKFLOW_ID = "seller-run";
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

// What each step hands the next.
const carry = trigger.extend({
  designId: z.string().optional(),
  ideaId: z.string().optional(),
  productId: z.string().optional(),
});
type Carry = z.infer<typeof carry>;

const decision = z.object({
  approve: z.boolean(),
  reason: z.string().optional(),
});

const RETRIES = 3;
const RETRY_DELAY_MS = 5000;
// Inngest re-invokes the whole function (memoized steps skip) with its own
// exponential backoff when an invocation dies: a crash, a timeout, a deploy.
const FUNCTION_RETRIES = 4;
const RUNS_PER_MERCHANT = 2;
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
      if (found.ideaId === undefined) {
        await finishRun(actorFor(inputData.userId), inputData.runId, {
          error: "Research found no ideas for this seed.",
          status: "failed",
        });
        return bail(inputData);
      }
      return { ...inputData, ideaId: found.ideaId };
    },
    id: "research",
    inputSchema: trigger,
    outputSchema: carry,
    retries: RETRIES,
  });

  const design = createStep({
    execute: async ({ inputData }) => {
      const drafted = await body(
        async (actor, from) =>
          await designStep(actor, from.runId, from.ideaId ?? "")
      )(inputData);
      return { ...inputData, designId: drafted.designId };
    },
    id: "design",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
  });

  const approval = createStep({
    execute: async ({ bail, inputData, resumeData, suspend }) => {
      const designId = inputData.designId ?? "";
      const actor = actorFor(inputData.userId);
      let approved: boolean;
      let reason: string | null | undefined;
      if (inputData.input.autopilot) {
        ({ approved, reason } = await body(
          async (as) => await autopilotStep(as, designId)
        )(inputData));
      } else if (resumeData === undefined) {
        await awaitApproval(actor, inputData.runId);
        return await suspend({ designId });
      } else {
        approved = resumeData.approve;
        ({ reason } = resumeData);
      }
      if (!approved) {
        await finishRun(
          actor,
          inputData.runId,
          inputData.input.autopilot
            ? {
                error: `Autopilot rejected the design: ${reason ?? ""}`,
                status: "failed",
              }
            : { status: "completed" }
        );
        return bail(inputData);
      }
      return inputData;
    },
    id: APPROVAL_STEP_ID,
    inputSchema: carry,
    outputSchema: carry,
    resumeSchema: decision,
    retries: RETRIES,
    suspendSchema: z.object({ designId: z.string() }),
  });

  const product = createStep({
    execute: async ({ inputData }) => {
      const made = await body(
        async (actor, from) =>
          await productStep(actor, from.runId, from.designId ?? "")
      )(inputData);
      return { ...inputData, productId: made.productId };
    },
    id: "product",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
  });

  const campaign = createStep({
    execute: async ({ inputData }) => {
      await body(async (actor, from) => {
        await campaignStep(actor, from.runId, {
          input: from.input,
          productId: from.productId ?? "",
        });
        await finishRun(actor, from.runId, { status: "completed" });
      })(inputData);
      return inputData;
    },
    id: "campaign",
    inputSchema: carry,
    outputSchema: carry,
    retries: RETRIES,
  });

  return (
    createWorkflow({
      // One merchant can't flood the queue; others' runs go on.
      concurrency: { key: "event.data.resourceId", limit: RUNS_PER_MERCHANT },
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
      .then(design)
      .then(approval)
      .then(product)
      .then(campaign)
      /* oxlint-enable promise/prefer-await-to-then */
      .commit()
  );
};

export type RunWorkflow = ReturnType<typeof createRunWorkflow>;
