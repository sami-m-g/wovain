import { idea } from "@wovain/db/schema/seller";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { flagContextOf } from "./flags";
import { charge } from "./spend";

// Trend research (Qloo × Tavily), saved as ranked ideas.
export const researchIdeas = async (
  actor: Actor,
  seed: string,
  runId?: string
) => {
  // Qloo's hackathon terms allow it on free and demo plans only, so
  // trends-qloo is evaluated for the merchant's plan; paid plans get
  // Tavily-only trends (docs/adr/0001-progressive-delivery.md).
  const context = await flagContextOf(actor);
  const sources = {
    qloo: actor.core.flags.isOn("trends-qloo", context),
    tavily: actor.core.flags.isOn("trends-tavily", context),
  };
  // Without Tavily there's nothing to rank: don't spend the merchant's credits.
  if (!sources.tavily) {
    actor.log?.set({ trends: { ideas: 0, sources } });
    return [];
  }
  const { avoidNames, ideas, qloo } = await charge(
    actor,
    "research",
    { runId },
    async () => await actor.core.trends.research(seed, actor.log, sources)
  );
  actor.log?.set({ trends: { ideas: ideas.length, qloo, sources } });
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
