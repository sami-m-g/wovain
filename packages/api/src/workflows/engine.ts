import { Mastra } from "@mastra/core/mastra";
import { createServe } from "@mastra/inngest";
import { PostgresStore } from "@mastra/pg";
import type { Database } from "@wovain/db";
import { Inngest } from "inngest";
import { serve } from "inngest/next";
import { z } from "zod";

import type { RunEngine } from "../flow/actor";
import { finishRun } from "../flow/runs";
import { createObservability } from "./observability";
import { createLegacyRunEngine, createRunRouter } from "./rollout";
import { APPROVAL_STEP_ID, createRunWorkflow, RUN_WORKFLOW_ID } from "./run";
import type { RunServices } from "./run";

// The durable engine behind runs: Mastra workflows executed by Inngest
// (docs/adr/0001-durable-runs.md). Mastra keeps workflow snapshots (what a
// suspended run resumes from) in Postgres, in its own `mastra` schema next
// to the app's tables. Inngest reads INNGEST_EVENT_KEY and
// INNGEST_SIGNING_KEY from the environment; INNGEST_DEV=1 points it at the
// local Dev Server (`npx inngest-cli dev`).

export const INNGEST_APP_ID = "wovain";

// What Inngest sends when a function fails for good, after every retry:
// the original trigger event rides along.
const failedRun = z.object({
  error: z.object({ message: z.string() }).partial().optional(),
  event: z.object({
    data: z.object({
      inputData: z.object({ userId: z.string() }).optional(),
      runId: z.string(),
    }),
  }),
  function_id: z.string(),
});

// Mastra's store on the app's database: workflow snapshots, memory threads,
// working memory, scores and traces, all in the `mastra` schema.
export const createMastraStorage = (pool: Database["$client"]) =>
  new PostgresStore({ id: "wovain-mastra", pool, schemaName: "mastra" });

// The app's one Mastra instance: the run workflow, the agents with their
// scorers, guardrails and memory (@wovain/core/agents), and tracing.
export const createMastra = ({
  cloudTrace,
  inngest,
  services,
  storage,
}: {
  cloudTrace: boolean;
  inngest: Inngest;
  services: RunServices;
  storage: PostgresStore;
}) =>
  new Mastra({
    agents: { ...services.core.agents?.agents },
    observability: createObservability({
      analytics: services.analytics,
      cloudTrace,
    }),
    scorers: services.core.agents?.scorers ?? {},
    storage,
    workflows: { [RUN_WORKFLOW_ID]: createRunWorkflow(inngest, services) },
  });

export const createRunEngine = ({
  cloudTrace,
  mastraFor,
  services,
  storage,
}: {
  // Export Mastra traces to Cloud Trace (on Google Cloud).
  cloudTrace: boolean;
  // Whether the merchant's runs go to this engine (the mastra-runs flag).
  mastraFor: (userId: string) => boolean;
  services: RunServices;
  storage: PostgresStore;
}) => {
  const inngest = new Inngest({ id: INNGEST_APP_ID });
  const mastra = createMastra({ cloudTrace, inngest, services, storage });

  // A run whose function died for good (its retries spent on crashes or
  // timeouts, so the workflow's own onError never ran) still ends: failed,
  // with what it staged on Meta archived.
  const onRunFailed = inngest.createFunction(
    {
      id: "seller-run-failed",
      triggers: { event: "inngest/function.failed" },
    },
    async ({ event }) => {
      const failed = failedRun.safeParse(event.data);
      if (
        !failed.success ||
        !failed.data.function_id.endsWith(`workflow.${RUN_WORKFLOW_ID}`)
      ) {
        return { skipped: true };
      }
      const { error, event: trigger } = failed.data;
      const userId = trigger.data.inputData?.userId;
      if (userId === undefined) {
        return { skipped: true };
      }
      await finishRun({ ...services, userId }, trigger.data.runId, {
        error: error?.message ?? "The run stopped after repeated failures",
        status: "failed",
      });
      return { failed: trigger.data.runId };
    }
  );

  const durable: RunEngine = {
    resume: async (runId, decision) => {
      const resumed = await mastra
        .getWorkflow(RUN_WORKFLOW_ID)
        .createRun({ runId });
      await resumed.resumeAsync({
        resumeData: decision,
        step: APPROVAL_STEP_ID,
      });
    },
    start: async ({ input, runId, userId }) => {
      // The app's run ID is the workflow's: one name for the run everywhere.
      const started = await mastra
        .getWorkflow(RUN_WORKFLOW_ID)
        .createRun({ resourceId: userId, runId });
      await started.startAsync({ inputData: { input, runId, userId } });
    },
  };

  // The route Inngest calls: app/api/inngest/route.ts exports it.
  const handler = createServe(serve)({
    functions: [onRunFailed],
    inngest,
    mastra,
  });

  const runs = createRunRouter({
    db: services.db,
    legacy: createLegacyRunEngine(services),
    mastra: durable,
    mastraFor,
  });

  return { handler, runs };
};
