import type { TrendSources } from "@wovain/core/trends";
import { idea } from "@wovain/db/schema/seller";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { flagContextOf } from "./flags";
import { charge } from "./spend";

export interface ResearchOptions {
  // false: the merchant runs without Qloo (the LLM-only comparison).
  qloo?: boolean | undefined;
}

// Which sources a run's research uses. Qloo runs for every plan, and
// trends-qloo is only its kill switch. With qloo-taste-map on, the run also
// saves the taste map and the merchant may run without Qloo (the LLM-only
// comparison).
export const researchSourcesFor = async (
  actor: Actor,
  options: ResearchOptions = {}
): Promise<TrendSources> => {
  const context = flagContextOf(actor);
  const [qlooOn, tasteMap, tavilyOn, evidenceOn] = await Promise.all([
    actor.core.flags.isOn("trends-qloo", context),
    actor.core.flags.isOn("qloo-taste-map", context),
    actor.core.flags.isOn("trends-tavily", context),
    actor.core.flags.isOn("tavily-evidence", context),
  ]);
  return {
    evidence: evidenceOn,
    qloo: qlooOn && (!tasteMap || options.qloo !== false),
    tasteMap,
    tavily: tavilyOn,
  };
};

export const tasteMapStatus = async (actor: Actor) => ({
  enabled: await actor.core.flags.isOn("qloo-taste-map", flagContextOf(actor)),
});

// Trend research (Qloo × Tavily), saved as ranked ideas.
export const researchIdeas = async (
  actor: Actor,
  seed: string,
  runId?: string,
  options: ResearchOptions = {}
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
  const sources = await researchSourcesFor(actor, options);
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
