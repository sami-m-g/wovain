import { idea } from "@wovain/db/schema/seller";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { meter } from "./spend";

// Trend research (Qloo × Tavily), saved as ranked ideas.
export const researchIdeas = async (
  actor: Actor,
  seed: string,
  runId?: string
) => {
  // A run's research step retried after it saved its ideas keeps them.
  if (runId !== undefined) {
    const saved = await actor.db
      .select()
      .from(idea)
      .where(and(eq(idea.userId, actor.userId), eq(idea.runId, runId)))
      .orderBy(asc(idea.rank));
    if (saved.length > 0) {
      return saved;
    }
  }
  await meter(actor, "run", { runId });
  const { avoidNames, ideas, qloo } = await actor.core.trends.research(
    seed,
    actor.log
  );
  actor.log?.set({ trends: { ideas: ideas.length, qloo } });
  if (ideas.length === 0) {
    return [];
  }
  return await actor.db
    .insert(idea)
    .values(
      ideas.map((research) => ({
        avoidNames,
        rank: research.rank,
        research,
        runId: runId ?? null,
        score: research.score,
        seed,
        theme: research.theme,
        userId: actor.userId,
      }))
    )
    .returning();
};

export const listIdeas = async ({ db, userId }: Actor, runId?: string) =>
  await db
    .select()
    .from(idea)
    .where(
      runId === undefined
        ? eq(idea.userId, userId)
        : and(eq(idea.userId, userId), eq(idea.runId, runId))
    )
    .orderBy(desc(idea.createdAt), asc(idea.rank));

export const getIdea = async ({ db, userId }: Actor, id: string) => {
  const row = await db.query.idea.findFirst({ where: { id, userId } });
  if (row === undefined) {
    throw notFound.idea({ id });
  }
  return row;
};
