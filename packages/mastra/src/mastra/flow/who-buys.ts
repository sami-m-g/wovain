import { isQlooTag } from "@wovain/core/qloo";
import { DecisionTrace } from "@wovain/core/trace";
import type { TrendIdea } from "@wovain/core/trends";
import { DEFAULT_LOCATION, whoBuys } from "@wovain/core/who-buys";
import type { WhoBuys } from "@wovain/core/who-buys";
import { idea } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { flagContextOf } from "./flags";
import { assertQlooOn, getIdea } from "./ideas";

// "Who buys this and where" on each idea (openspec who-buys), behind the
// who-buys flag: read from Qloo the first time it is asked for, kept on the
// idea, and shown before any connector. Every read is saved in the
// decision trace; a Qloo failure is an error, never a guess.

// Entities read for the buyers: the seed's Qloo matches first, then the
// strongest cross-domain affinities.
const MAX_ENTITIES = 5;

export const whoBuysOn = async (actor: Actor) =>
  await actor.core.flags.isOn("who-buys", flagContextOf(actor));

const whoBuysOff = () =>
  createError({
    fix: "Turn on the who-buys flag for this environment.",
    message: "Who buys this isn't available yet",
    status: 404,
    why: "The who-buys flag is off.",
  });

// The brief's Qloo entities: the seed's matches, then the strongest
// cross-domain affinities. Every idea of a run shares them.
const briefEntitiesOf = (research: TrendIdea) => {
  const { taste } = research;
  const ids = [
    ...(taste?.seeds ?? []).map((one) => one.id),
    ...(taste?.affinities ?? [])
      .toSorted((first, second) => second.affinity - first.affinity)
      .map((one) => one.id),
  ];
  return [...new Set(ids)].slice(0, MAX_ENTITIES);
};

// The idea's own Qloo signal is its tag: the audiences, places and brands
// are read from it alone, so each idea gets its own buyers (with the
// brief's entities mixed in, every idea of a run got the same). The age and
// gender need entities, so they come from the brief's, and say so. An idea
// without a tag (saved before Qloo was required) reads the brief's. An idea
// picked from a drop direction keeps the theme's name, not a tag ID (Qloo
// answers 400 "Could not find a valid tag"), and its seeds are the
// direction's own rising entities: it reads those.
export const signalsOf = (research: TrendIdea) => {
  const brief = briefEntitiesOf(research);
  if (research.qlooTag === undefined || !isQlooTag(research.qlooTag)) {
    return {
      options: {
        scope:
          research.qlooTag === undefined
            ? ("brief" as const)
            : ("idea" as const),
      },
      signals: { entities: brief, tags: [] },
    };
  }
  return {
    options: { demographics: brief, scope: "idea" as const },
    signals: { entities: [], tags: [research.qlooTag] },
  };
};

const flush = async (actor: Actor, trace: DecisionTrace) => {
  try {
    await trace.flush();
  } catch (error) {
    evlog.error({
      decisionTrace: {
        reason: error instanceof Error ? error.message : String(error),
        userId: actor.userId,
      },
      error: "DECISION_TRACE_NOT_SAVED",
    });
  }
};

// Who buys the idea and where, within `location` (a country); read once
// per location and kept on the idea.
export const ideaWhoBuys = async (
  actor: Actor,
  ideaId: string,
  location: string = DEFAULT_LOCATION
): Promise<WhoBuys> => {
  if (!(await whoBuysOn(actor))) {
    throw whoBuysOff();
  }
  const row = await getIdea(actor, ideaId);
  // Answers kept before scopes were read from the brief: read again.
  if (
    row.whoBuys !== null &&
    row.whoBuys.location === location &&
    row.whoBuys.scope !== undefined
  ) {
    return row.whoBuys;
  }
  await assertQlooOn(actor);
  const trace = new DecisionTrace(
    { runId: row.runId ?? undefined, userId: actor.userId },
    traceSinkFor(actor)
  );
  try {
    const { options, signals } = signalsOf(row.research);
    const result = await whoBuys(
      { log: actor.log, qloo: actor.core.qloo, trace },
      signals,
      location,
      options
    );
    await actor.db
      .update(idea)
      .set({ whoBuys: result })
      .where(and(eq(idea.id, ideaId), eq(idea.userId, actor.userId)));
    return result;
  } finally {
    await flush(actor, trace);
  }
};

// Who buys a suggested direction (drop-directions) and where: read from
// the Qloo entities rising for it. Not kept: Qloo's own answers are reused
// for 30 minutes, and the suggestion itself is kept.
export const directionWhoBuys = async (
  actor: Actor,
  entities: readonly string[],
  location: string = DEFAULT_LOCATION
): Promise<WhoBuys> => {
  if (!(await whoBuysOn(actor))) {
    throw whoBuysOff();
  }
  await assertQlooOn(actor);
  const trace = new DecisionTrace(
    { userId: actor.userId },
    traceSinkFor(actor)
  );
  try {
    return await whoBuys(
      { log: actor.log, qloo: actor.core.qloo, trace },
      { entities: entities.slice(0, MAX_ENTITIES) },
      location,
      { scope: "idea" }
    );
  } finally {
    await flush(actor, trace);
  }
};
