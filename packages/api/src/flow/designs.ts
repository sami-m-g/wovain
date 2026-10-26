import { randomUUID } from "node:crypto";

import { reviewDesign } from "@wovain/core/autopilot";
import { draftBrief, judgeDesign } from "@wovain/core/design";
import { NEMOTRON_MODEL, withLlmTrace } from "@wovain/core/nemotron";
import { recordTaste } from "@wovain/core/taste";
import { design, run } from "@wovain/db/schema/seller";
import { and, count, desc, eq } from "drizzle-orm";

import type { Actor, RunDecision } from "./actor";
import { notFound } from "./actor";
import { requireFal, withProvider } from "./connections";
import { getIdea } from "./ideas";
import { track } from "./metrics";
import { once } from "./once";
import { meter } from "./spend";
import { designAlreadyDecided, runNotWaiting } from "./transitions";

// An idea becomes a design: Nemotron writes the brief, fal draws the art,
// Nemotron judges it. The merchant (or autopilot) then approves or rejects.

// The judge scores 0 to 100; agent_score is 0 to 1.
const JUDGE_SCALE = 100;

const byKey = async ({ db, userId }: Actor, key: string) =>
  await db.query.design.findFirst({ where: { idempotencyKey: key, userId } });

// design_generated and the judge's agent_score, for the approval rate and
// the quality trend. variant_index counts the idea's earlier designs.
const reportDesign = async (
  actor: Actor,
  row: {
    id: string;
    ideaId: string;
    judgment: { score: number };
    runId: string | null;
  }
) => {
  const [drawn] = await actor.db
    .select({ n: count() })
    .from(design)
    .where(eq(design.ideaId, row.ideaId));
  await track(actor, "design_generated", {
    design_id: row.id,
    model: NEMOTRON_MODEL,
    run_id: row.runId,
    variant_index: Math.max((drawn?.n ?? 1) - 1, 0),
  });
  await track(actor, "agent_score", {
    design_id: row.id,
    run_id: row.runId,
    score: row.judgment.score / JUDGE_SCALE,
    scorer: "design_judge",
    target: "design",
  });
};

// `requestId` keys the design: a run step passes its own, so a retried step
// keeps the brief and the art (fal is asked to draw once). Without one each
// call is a new design, as a merchant's "try again" means.
export const generateDesign = async (
  actor: Actor,
  ideaId: string,
  { requestId = randomUUID() }: { requestId?: string | undefined } = {}
) => {
  const key = `design:${actor.userId}:${requestId}`;
  const made = await byKey(actor, key);
  if (made !== undefined) {
    return made;
  }
  const source = await getIdea(actor, ideaId);
  const { runId } = source;
  // The merchant's own fal account draws; checked first, so a missing grant
  // stops the step before any model call.
  await requireFal(actor);
  const { artist, nemotron } = actor.core;
  const { artwork, brief, judgment } = await withLlmTrace(
    { distinctId: actor.userId, traceId: runId ?? ideaId },
    async () => {
      const drafted = await once(actor, {
        key: `${key}:brief`,
        operation: "design_brief",
        perform: async () =>
          await draftBrief(
            nemotron,
            { avoidNames: source.avoidNames, idea: source.research },
            actor.log
          ),
        provider: "nebius",
        runId,
      });
      const requested = await once(actor, {
        key: `${key}:art`,
        operation: "submit_art",
        perform: async () => {
          await meter(actor, "image", { runId });
          return await withProvider(
            actor,
            "fal",
            async (call) => await artist(call).submit(drafted, actor.log)
          );
        },
        provider: "fal",
        runId,
      });
      // Reading fal's answer again is free: no key needed.
      const art = await withProvider(
        actor,
        "fal",
        async (call) => await artist(call).result(requested, actor.log)
      );
      return {
        artwork: art,
        brief: drafted,
        judgment: await judgeDesign(
          nemotron,
          { artwork: art, brief: drafted, idea: source.theme },
          actor.log
        ),
      };
    }
  );
  await actor.db
    .insert(design)
    .values({
      artworkHeight: artwork.height,
      artworkUrl: artwork.url,
      artworkWidth: artwork.width,
      brief,
      ideaId,
      idempotencyKey: key,
      judgment,
      runId,
      userId: actor.userId,
    })
    .onConflictDoNothing({ target: design.idempotencyKey });
  const row = await byKey(actor, key);
  if (row === undefined) {
    throw new Error("The design wasn't saved");
  }
  await reportDesign(actor, row);
  return row;
};

export const getDesign = async ({ db, userId }: Actor, id: string) => {
  const row = await db.query.design.findFirst({ where: { id, userId } });
  if (row === undefined) {
    throw notFound.design({ id });
  }
  return row;
};

export const listDesigns = async ({ db, userId }: Actor, runId?: string) =>
  await db
    .select()
    .from(design)
    .where(
      runId === undefined
        ? eq(design.userId, userId)
        : and(eq(design.userId, userId), eq(design.runId, runId))
    )
    .orderBy(desc(design.createdAt));

export interface Decision extends RunDecision {
  by: "merchant" | "autopilot";
}

// The only move out of pending_approval: approve or reject, once. A design
// already decided answers DESIGN_ALREADY_DECIDED, so a second click, a
// second client or a late retry can't flip it. A merchant's call on a run
// waiting at its gate resumes that run, in the same transaction: if the
// resume can't be queued, the decision isn't kept either.
const commitDecision = async (
  actor: Actor,
  id: string,
  { approve, by, reason }: Decision
) =>
  await actor.db.transaction(async (tx) => {
    const [row] = await tx
      .update(design)
      .set({
        decidedBy: by,
        decisionReason: reason ?? null,
        status: approve ? "approved" : "rejected",
      })
      .where(
        and(
          eq(design.id, id),
          eq(design.userId, actor.userId),
          eq(design.status, "pending_approval")
        )
      )
      .returning();
    if (row !== undefined && !approve) {
      await track(actor, "design_rejected", {
        decided_by: by,
        design_id: row.id,
        reason: reason ?? null,
        run_id: row.runId,
      });
    }
    if (row === undefined) {
      // Read inside the transaction: it holds the connection.
      const current = await tx.query.design.findFirst({
        where: { id, userId: actor.userId },
      });
      if (current === undefined) {
        throw notFound.design({ id });
      }
      throw designAlreadyDecided({
        designId: current.id,
        status: current.status === "approved" ? "approved" : "rejected",
      });
    }
    if (by !== "merchant" || row.runId === null) {
      return row;
    }
    const [waiting] = await tx
      .update(run)
      .set({ status: "running", step: approve ? "approved" : "rejected" })
      .where(and(eq(run.id, row.runId), eq(run.status, "awaiting_approval")))
      .returning({ id: run.id });
    if (waiting === undefined) {
      return row;
    }
    if (actor.runs === undefined) {
      throw new Error("No run engine to resume the run");
    }
    try {
      await actor.runs.resume(waiting.id, { approve, reason });
    } catch (error) {
      throw runNotWaiting(waiting.id, error);
    }
    return row;
  });

// The merchant's call teaches the agents their taste (@wovain/core/taste).
// Memory is a nicety: a failed write never fails the decision.
const learnTaste = async (
  actor: Actor,
  decided: { brief: { title: string }; decisionReason: string | null },
  approve: boolean
) => {
  const { memory } = actor.core;
  if (memory === undefined) {
    return;
  }
  try {
    await recordTaste(memory, {
      approved: approve,
      reason: decided.decisionReason,
      title: decided.brief.title,
      userId: actor.userId,
    });
  } catch (error) {
    actor.log?.set({
      taste: { failed: error instanceof Error ? error.message : String(error) },
    });
  }
};

export const decideDesign = async (
  actor: Actor,
  id: string,
  decision: Decision
) => {
  const decided = await commitDecision(actor, id, decision);
  if (decision.by === "merchant") {
    await learnTaste(actor, decided, decision.approve);
  }
  return decided;
};

// Autopilot's review: Nemotron decides, gated by the judge's verdict.
export const autopilotDecide = async (
  actor: Actor,
  current: Awaited<ReturnType<typeof getDesign>>
) => {
  // A retried step finds its own decision and keeps it.
  if (current.status !== "pending_approval") {
    return current;
  }
  const source = await getIdea(actor, current.ideaId);
  await meter(actor, "llm", { runId: current.runId });
  const decision = await reviewDesign(
    actor.core.nemotron,
    {
      brief: current.brief,
      idea: source.theme,
      judgment: current.judgment,
    },
    actor.log
  );
  return await decideDesign(actor, current.id, {
    approve: decision.approve,
    by: "autopilot",
    reason: decision.reason,
  });
};
