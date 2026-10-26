import { withLlmTrace } from "@wovain/core/nemotron";
import { run } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";

import type { Actor, RunEngine } from "../flow/actor";
import {
  autopilotStep,
  awaitApproval,
  campaignStep,
  designStep,
  finishRun,
  productStep,
  researchStep,
} from "../flow/runs";
import type { RunServices } from "./run";

// The mastra-runs rollout: runs go to the durable Mastra workflow only while
// the flag is on for the merchant; otherwise to the legacy flow, which runs
// in the request as before (and whose approval ends the run, as before).
// Each run remembers its engine (run.engine), so a decision resumes it where
// it started even if the flag flips in between.

// The legacy flow: every step awaited inside the request that started it.
export const createLegacyRunEngine = (services: RunServices): RunEngine => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });
  return {
    // The legacy flow never continued past approval: the merchant's call
    // ends the run, and the wizard makes the product and campaign itself.
    resume: async (runId) => {
      const [row] = await services.db
        .select({ userId: run.userId })
        .from(run)
        .where(eq(run.id, runId));
      if (row !== undefined) {
        await finishRun(actorFor(row.userId), runId, { status: "completed" });
      }
    },
    start: async ({ input, runId, userId }) => {
      const actor = actorFor(userId);
      try {
        await withLlmTrace({ distinctId: userId, traceId: runId }, async () => {
          const { ideaId } = await researchStep(actor, runId, input);
          if (ideaId === undefined) {
            await finishRun(actor, runId, {
              error: "Research found no ideas for this seed.",
              status: "failed",
            });
            return;
          }
          const { designId } = await designStep(actor, runId, ideaId);
          if (!input.autopilot) {
            await awaitApproval(actor, runId);
            return;
          }
          const decided = await autopilotStep(actor, designId);
          if (!decided.approved) {
            await finishRun(actor, runId, {
              error: `Autopilot rejected the design: ${decided.reason ?? ""}`,
              status: "failed",
            });
            return;
          }
          const { productId } = await productStep(actor, runId, designId);
          await campaignStep(actor, runId, { input, productId });
          await finishRun(actor, runId, { status: "completed" });
        });
      } catch (error) {
        await finishRun(actor, runId, {
          cause: error,
          error: error instanceof Error ? error.message : String(error),
          status: "failed",
        });
      }
    },
  };
};

// Routes each run to its engine: the flag decides at start, run.engine at
// resume.
export const createRunRouter = ({
  db,
  legacy,
  mastra,
  mastraFor,
}: {
  db: RunServices["db"];
  legacy: RunEngine;
  mastra: RunEngine;
  mastraFor: (userId: string) => boolean;
}): RunEngine => ({
  resume: async (runId, decision) => {
    const [row] = await db
      .select({ engine: run.engine })
      .from(run)
      .where(eq(run.id, runId));
    const engine = row?.engine === "mastra" ? mastra : legacy;
    await engine.resume(runId, decision);
  },
  start: async (started) => {
    const durable = mastraFor(started.userId);
    await db
      .update(run)
      .set({ engine: durable ? "mastra" : "legacy" })
      .where(and(eq(run.id, started.runId), eq(run.userId, started.userId)));
    await (durable ? mastra : legacy).start(started);
  },
});
