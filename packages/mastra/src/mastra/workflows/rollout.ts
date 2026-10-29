import { run } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";

import type { Actor, RunEngine } from "../flow/actor";
import { withAgentTrace } from "../flow/agent-trace";
import {
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
import type { RunServices } from "./run";

// The mastra-runs rollout: runs go to the durable Mastra workflow only while
// the flag is on for the merchant; otherwise to the legacy flow, which runs
// in the request as before (and whose approval ends the run, as before).
// Each run remembers its engine (run.engine), so a decision resumes it where
// it started even if the flag flips in between.

// A legacy step that throws fails the run, as the legacy flow always did.
const failOnError = async (
  actor: Actor,
  runId: string,
  work: () => Promise<void>
) => {
  try {
    await withAgentTrace(
      actor,
      { runId, traceId: runId },
      async () => await work()
    );
  } catch (error) {
    await finishRun(actor, runId, {
      cause: error,
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
  }
};

// The legacy flow: every step awaited inside the request that started it.
export const createLegacyRunEngine = (services: RunServices): RunEngine => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });
  return {
    // The merchant's "See designs": draws the approved ideas in the request,
    // then waits at the approval gate.
    approveIdeas: async (runId, ideaIds) => {
      const [row] = await services.db
        .select({ userId: run.userId })
        .from(run)
        .where(eq(run.id, runId));
      if (row === undefined) {
        return;
      }
      const actor = actorFor(row.userId);
      await failOnError(actor, runId, async () => {
        await designStep(actor, runId, ideaIds);
        if (!(await awaitApproval(actor, runId))) {
          await finishRun(actor, runId, { status: "completed" });
        }
      });
    },
    // The legacy flow never continued past approval: the merchant's call on
    // the run's last pending design ends the run, and the wizard makes a
    // product and campaign for each approved design itself.
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
      await failOnError(actor, runId, async () => {
        const { ideaIds } = await researchStep(actor, runId, input);
        if (ideaIds.length === 0) {
          await finishRun(actor, runId, {
            error: "Research found no ideas for this seed.",
            status: "failed",
          });
          return;
        }
        // A merchant's run draws nothing until they approve ideas.
        if (!input.autopilot) {
          await awaitIdeas(actor, runId);
          return;
        }
        const { designIds } = await designStep(actor, runId, ideaIds);
        const decided = await autopilotStep(actor, runId, designIds);
        if (decided.approvedIds.length === 0) {
          await finishRun(actor, runId, {
            error: autopilotRejection(decided.reasons),
            status: "failed",
          });
          return;
        }
        const { productIds } = await productStep(
          actor,
          runId,
          decided.approvedIds,
          { autopilot: true }
        );
        await campaignStep(actor, runId, { input, productIds });
        await finishRun(actor, runId, { status: "completed" });
      });
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
  mastraFor: (userId: string) => Promise<boolean>;
}): RunEngine => {
  const engineOf = async (runId: string) => {
    const [row] = await db
      .select({ engine: run.engine })
      .from(run)
      .where(eq(run.id, runId));
    return row?.engine === "mastra" ? mastra : legacy;
  };
  return {
    approveIdeas: async (runId, ideaIds) => {
      const engine = await engineOf(runId);
      await engine.approveIdeas(runId, ideaIds);
    },
    resume: async (runId, decision) => {
      const engine = await engineOf(runId);
      await engine.resume(runId, decision);
    },
    start: async (started) => {
      const durable = await mastraFor(started.userId);
      await db
        .update(run)
        .set({ engine: durable ? "mastra" : "legacy" })
        .where(and(eq(run.id, started.runId), eq(run.userId, started.userId)));
      await (durable ? mastra : legacy).start(started);
    },
  };
};
