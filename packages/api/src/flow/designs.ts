import { reviewDesign } from "@wovain/core/autopilot";
import { draftBrief, judgeDesign } from "@wovain/core/design";
import { withLlmTrace } from "@wovain/core/nemotron";
import { design, run } from "@wovain/db/schema/seller";
import { and, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { getIdea } from "./ideas";
import { charge } from "./spend";

// An idea becomes a design: Nemotron writes the brief, fal draws the art,
// Nemotron judges it. The merchant (or autopilot) then approves or rejects.

export const generateDesign = async (actor: Actor, ideaId: string) => {
  const source = await getIdea(actor, ideaId);
  const { artist, nemotron } = actor.core;
  const { artwork, brief, judgment } = await charge(
    actor,
    "design",
    { runId: source.runId },
    async () =>
      await withLlmTrace(
        { distinctId: actor.userId, traceId: source.runId ?? ideaId },
        async () => {
          const drafted = await draftBrief(
            nemotron,
            { avoidNames: source.avoidNames, idea: source.research },
            actor.log
          );
          const art = await artist(drafted, actor.log);
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
      )
  );
  const [row] = await actor.db
    .insert(design)
    .values({
      artworkHeight: artwork.height,
      artworkUrl: artwork.url,
      artworkWidth: artwork.width,
      brief,
      ideaId,
      judgment,
      runId: source.runId,
      userId: actor.userId,
    })
    .returning();
  if (row === undefined) {
    throw new Error("The design wasn't saved");
  }
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

export interface Decision {
  approve: boolean;
  by: "merchant" | "autopilot";
  reason?: string | undefined;
}

// Records the call on a design; a merchant's call closes its run's approval.
export const decideDesign = async (
  actor: Actor,
  id: string,
  { approve, by, reason }: Decision
) => {
  const current = await getDesign(actor, id);
  const [row] = await actor.db
    .update(design)
    .set({
      decidedBy: by,
      decisionReason: reason ?? null,
      status: approve ? "approved" : "rejected",
    })
    .where(eq(design.id, current.id))
    .returning();
  if (by === "merchant" && current.runId !== null) {
    await actor.db
      .update(run)
      .set({ status: "completed", step: approve ? "approved" : "rejected" })
      .where(
        and(eq(run.id, current.runId), eq(run.status, "awaiting_approval"))
      );
  }
  return row ?? current;
};

// Autopilot's review: Nemotron decides, gated by the judge's verdict.
export const autopilotDecide = async (
  actor: Actor,
  current: Awaited<ReturnType<typeof getDesign>>
) => {
  const source = await getIdea(actor, current.ideaId);
  const decision = await charge(
    actor,
    "assist",
    { runId: current.runId },
    async () =>
      await reviewDesign(
        actor.core.nemotron,
        {
          brief: current.brief,
          idea: source.theme,
          judgment: current.judgment,
        },
        actor.log
      )
  );
  return await decideDesign(actor, current.id, {
    approve: decision.approve,
    by: "autopilot",
    reason: decision.reason,
  });
};
