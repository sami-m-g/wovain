import { AGENT_ROLES } from "@wovain/core/agents";
import { decisionTrace } from "@wovain/db/schema/autonomy";
import { run } from "@wovain/db/schema/seller";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";

// "Which model did what": every agent call of one run from its decision
// trace (./agent-trace), with the Nemotron model it ran on and the job
// (role) that picked it, plus the model per job for this environment.

const MAX_ENTRIES = 300;

export const modelRoutingOff = () =>
  createError({
    fix: "Turn on the model-routing flag for this environment.",
    message: "The model trace isn't available yet",
    status: 404,
    why: "The model-routing flag is off.",
  });

const roleOf = (agent: string) =>
  agent in AGENT_ROLES ? AGENT_ROLES[agent as keyof typeof AGENT_ROLES] : null;

// A line on what a call returned, for the entries that need one: what the
// grounding guard removed, or why a call failed.
const noteOf = (output: unknown) => {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const { error, unsupported } = output as {
    error?: unknown;
    unsupported?: unknown;
  };
  if (typeof error === "string") {
    return error;
  }
  if (Array.isArray(unsupported) && unsupported.length > 0) {
    return unsupported.join(", ");
  }
  return null;
};

// The run to show: the one asked for, else the merchant's latest traced run.
const runToShow = async (actor: Actor, runId: string | undefined) => {
  if (runId !== undefined) {
    return runId;
  }
  const [latest] = await actor.db
    .select({ runId: decisionTrace.runId })
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, actor.userId),
        isNotNull(decisionTrace.runId)
      )
    )
    .orderBy(desc(decisionTrace.at))
    .limit(1);
  return latest?.runId ?? undefined;
};

export const modelTrace = async (actor: Actor, runId?: string) => {
  if (!(await actor.core.flags.isOn("model-routing", flagContextOf(actor)))) {
    throw modelRoutingOff();
  }
  const { models } = actor.core.models;
  const shown = await runToShow(actor, runId);
  if (shown === undefined) {
    return { entries: [], models, run: null };
  }
  const [found] = await actor.db
    .select({ createdAt: run.createdAt, id: run.id, seed: run.seed })
    .from(run)
    .where(and(eq(run.id, shown), eq(run.userId, actor.userId)));
  if (found === undefined) {
    return { entries: [], models, run: null };
  }
  const rows = await actor.db
    .select()
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, actor.userId),
        eq(decisionTrace.runId, shown)
      )
    )
    .orderBy(asc(decisionTrace.at), asc(decisionTrace.seq))
    .limit(MAX_ENTRIES);
  return {
    entries: rows.map((row) => ({
      agent: row.agent,
      at: row.at,
      id: row.id,
      model: row.model,
      ms: row.ms,
      note: noteOf(row.output),
      ok: row.ok,
      role: roleOf(row.agent),
      step: row.step,
    })),
    models,
    run: found,
  };
};

export type ModelTrace = Awaited<ReturnType<typeof modelTrace>>;
