import { ORPCError } from "@orpc/server";
import { trendCardOf } from "@wovain/core/idea-card";
import { trendEvidenceOf, writeIdeaWords } from "@wovain/core/idea-words";
import { QLOO_NO_MATCH_MESSAGE } from "@wovain/core/log";
import { currentDecisions } from "@wovain/core/nemotron";
import { isQlooTag } from "@wovain/core/qloo";
import type { TrendIdea, TrendSources } from "@wovain/core/trends";
import { idea, run } from "@wovain/db/schema/seller";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { EvlogError } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { localeOf } from "./brand-discovery";
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

// What a run's research adds to Qloo's themes. The taste map is always on:
// every idea carries what Qloo said about it.
export const researchSourcesFor = async (
  actor: Actor
): Promise<TrendSources> => {
  const context = flagContextOf(actor);
  const [tavilyOn, evidenceOn, gateOn] = await Promise.all([
    actor.core.flags.isOn("trends-tavily", context),
    actor.core.flags.isOn("tavily-evidence", context),
    actor.core.flags.isOn("idea-evidence-gate", context),
  ]);
  return { evidence: evidenceOn, evidenceGate: gateOn, tavily: tavilyOn };
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
    // Research that found no ideas gave the merchant nothing (#232).
    { refundIf: (found) => found.ideas.length === 0, runId },
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

// Each idea with the one idea card (@wovain/core/idea-card), built from
// its research and the reads kept on it.
export const listIdeas = async ({ db, userId }: Actor, runId?: string) => {
  const rows = await db
    .select()
    .from(idea)
    .where(
      runId === undefined
        ? eq(idea.userId, userId)
        : and(eq(idea.userId, userId), eq(idea.runId, runId))
    )
    .orderBy(desc(idea.createdAt), asc(idea.rank));
  return rows.map((row) => ({
    ...row,
    card: trendCardOf(row.research, {
      competition: row.competition,
      whoBuys: row.whoBuys,
    }),
  }));
};

// The run's naming step: a readable title and concept for every idea, as
// for every direction (@wovain/core/drop-directions), written from its
// evidence and checked by the grounding guard (@wovain/core/idea-words).
// Ideas already named keep their words; words that fail twice are kept as
// unavailable, with the reason, and the idea is not shown: no card shows
// the raw tag. The run says it is naming meanwhile (step "name").
export const nameIdeas = async (
  actor: Actor,
  ideaIds: readonly string[],
  runId?: string
) => {
  if (ideaIds.length === 0) {
    return [];
  }
  if (runId !== undefined) {
    await actor.db
      .update(run)
      .set({ step: "name" })
      .where(and(eq(run.id, runId), eq(run.userId, actor.userId)));
  }
  const [rows, locale] = await Promise.all([
    actor.db
      .select()
      .from(idea)
      .where(
        and(eq(idea.userId, actor.userId), inArray(idea.id, [...ideaIds]))
      ),
    localeOf(actor),
  ]);
  const named = await Promise.all(
    rows.map(async (row) => {
      if (row.research.words !== undefined) {
        return row;
      }
      const words = await writeIdeaWords(
        {
          ask: actor.core.nemotron,
          locale,
          log: actor.log,
          trace: currentDecisions(),
        },
        trendEvidenceOf(row.research)
      );
      const research = { ...row.research, words };
      await actor.db
        .update(idea)
        .set({ research })
        .where(and(eq(idea.id, row.id), eq(idea.userId, actor.userId)));
      return { ...row, research };
    })
  );
  // The ideas to show: named, best first.
  return named
    .filter((row) => row.research.words?.status === "ok")
    .toSorted((first, second) => first.rank - second.rank);
};

export const getIdea = async ({ db, userId }: Actor, id: string) => {
  const row = await db.query.idea.findFirst({ where: { id, userId } });
  if (row === undefined) {
    throw notFound.idea({ id });
  }
  return row;
};

// An idea's Qloo tag ID. An idea picked from a drop direction before
// directions kept their tag's ID saved the theme's name instead: Qloo's tag
// search finds its ID. Undefined when Qloo has no tag of that name.
export const qlooTagOf = async (
  actor: Actor,
  { qlooTag }: Pick<TrendIdea, "qlooTag">
): Promise<string | undefined> => {
  if (qlooTag === undefined || isQlooTag(qlooTag)) {
    return qlooTag;
  }
  const [found] = await actor.core.qloo.tagsNamed(qlooTag, actor.log);
  return found;
};
