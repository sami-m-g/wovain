import { ORPCError } from "@orpc/server";
import { QLOO_NO_MATCH_MESSAGE } from "@wovain/core/log";
import type { TrendSources } from "@wovain/core/trends";
import { idea } from "@wovain/db/schema/seller";
import { and, asc, desc, eq } from "drizzle-orm";
import { EvlogError } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { researchFeedbackOf } from "./feedback";
import { flagContextOf } from "./flags";
import { charge } from "./spend";

const UNAVAILABLE = 503;
const UNPROCESSABLE = 422;

// Every idea is a Qloo tag, so research without Qloo is refused, never run
// on the brief alone. Procedures declare these (`.errors(researchErrors)`),
// so clients read `error.code` instead of parsing messages.
export const researchErrors = {
  // Qloo matched nothing in the brief: the merchant names something it knows.
  QLOO_NO_MATCH: {
    message: QLOO_NO_MATCH_MESSAGE,
    status: UNPROCESSABLE,
  },
  // The trends-qloo kill switch is off: no research, so no run, until it is
  // back on.
  QLOO_OFF: {
    message:
      "Trend research needs Qloo, and Qloo is switched off right now. Try again later.",
    status: UNAVAILABLE,
  },
} as const;

const researchError = (code: keyof typeof researchErrors, cause?: unknown) =>
  new ORPCError(code, {
    cause,
    message: researchErrors[code].message,
    status: researchErrors[code].status,
  });

// trends-qloo is an ops kill switch only: off, research and runs refuse to
// start rather than run without Qloo.
export const assertQlooOn = async (actor: Actor) => {
  if (!(await actor.core.flags.isOn("trends-qloo", flagContextOf(actor)))) {
    throw researchError("QLOO_OFF");
  }
};

// What a run's research adds to Qloo's themes. With qloo-taste-map on, it
// also saves the taste map on each idea.
export const researchSourcesFor = async (
  actor: Actor
): Promise<TrendSources> => {
  const context = flagContextOf(actor);
  const [tasteMap, tavilyOn, evidenceOn] = await Promise.all([
    actor.core.flags.isOn("qloo-taste-map", context),
    actor.core.flags.isOn("trends-tavily", context),
    actor.core.flags.isOn("tavily-evidence", context),
  ]);
  return { evidence: evidenceOn, tasteMap, tavily: tavilyOn };
};

const isNoMatch = (error: unknown) =>
  EvlogError.isEvlogError(error) && error.code === "QLOO_NO_MATCH";

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
  // Checked again here: the switch may have flipped since the run started.
  await assertQlooOn(actor);
  const sources = await researchSourcesFor(actor);
  // Without Tavily there's nothing to rank: don't spend the merchant's credits.
  if (!sources.tavily) {
    actor.log?.set({ trends: { ideas: 0, sources } });
    return [];
  }
  // With the feedback loop on, the merchant's re-fit weights score the
  // ideas (./feedback).
  const feedback = await researchFeedbackOf(actor);
  const { avoidNames, ideas } = await charge(
    actor,
    "research",
    { runId },
    async () =>
      await actor.core.trends.research(seed, actor.log, sources, feedback)
  ).catch((error: unknown) => {
    // The credits are released; the merchant gets the typed error.
    throw isNoMatch(error) ? researchError("QLOO_NO_MATCH", error) : error;
  });
  actor.log?.set({ trends: { ideas: ideas.length, sources } });
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
