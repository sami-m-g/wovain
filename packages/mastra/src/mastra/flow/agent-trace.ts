import { withLlmTrace } from "@wovain/core/nemotron";
import { DecisionTrace } from "@wovain/core/trace";
import { log } from "evlog";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { flagContextOf } from "./flags";

// Every Nemotron call inside `run` belongs to one LLM trace (PostHog groups
// its generations under `traceId`). With the model-routing flag on for the
// merchant, each agent also runs on its job's model, buyer-facing copy is
// grounded in the tools' results, and every call is saved to the decision
// trace ("which model did what", ../routers/models).
export const withAgentTrace = async <T>(
  actor: Actor,
  { runId, traceId }: { runId?: string | null | undefined; traceId: string },
  run: (routed: boolean) => Promise<T>
): Promise<T> => {
  const routed = await actor.core.flags.isOn(
    "model-routing",
    flagContextOf(actor)
  );
  const decisions = routed
    ? new DecisionTrace(
        { runId: runId ?? undefined, userId: actor.userId },
        traceSinkFor(actor)
      )
    : undefined;
  try {
    return await withLlmTrace(
      { decisions, distinctId: actor.userId, routed, traceId },
      async () => await run(routed)
    );
  } finally {
    // A trace that won't save doesn't undo the work it describes; the
    // failure goes to error tracking.
    await decisions?.flush().catch((error: unknown) => {
      actor.log?.set({ decisionTrace: { saved: false } });
      log.error({
        decisionTrace: {
          reason: error instanceof Error ? error.message : String(error),
          runId,
          userId: actor.userId,
        },
        error: "DECISION_TRACE_NOT_SAVED",
      });
    });
  }
};
