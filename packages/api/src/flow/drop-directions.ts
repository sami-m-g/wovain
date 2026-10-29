import { suggestDirections } from "@wovain/core/drop-directions";
import type { Directions } from "@wovain/core/drop-directions";
import { brandProfile, decisionTrace } from "@wovain/db/schema/autonomy";
import { and, count, eq, gt } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { localeOf, traced } from "./brand-discovery";
import { flagContextOf } from "./flags";
import { assertQlooOn } from "./ideas";

// What to sell next, in the new-drop step (openspec drop-directions),
// behind the drop-directions flag: 3 to 5 directions from Qloo trends with
// Tavily momentum and saturation. Within the saved brand when there is one
// (unless the merchant ignores it this time), else across Qloo audiences;
// a brand is never required. Every request is saved as a decision trace
// (agent drop_directions). Free, like brand discovery; each merchant asks
// at most DIRECTIONS_PER_HOUR times an hour.

const MINUTE_MS = 60_000;
const DIRECTIONS_PER_HOUR = 20;

export const directionsOn = async (actor: Actor) =>
  await actor.core.flags.isOn("drop-directions", flagContextOf(actor));

const directionsOff = () =>
  createError({
    fix: "Turn on the drop-directions flag for this environment.",
    message: "Suggested directions aren't available yet",
    status: 404,
    why: "The drop-directions flag is off.",
  });

const directionsExhausted = () =>
  createError({
    code: "DIRECTIONS_LIMIT",
    fix: "Wait an hour, or write your own direction.",
    message: "You've asked for a lot of directions this hour",
    status: 429,
    why: `Each merchant asks for at most ${DIRECTIONS_PER_HOUR} sets of directions an hour.`,
  });

const directionsUsed = async (actor: Actor) => {
  const [used] = await actor.db
    .select({ runs: count() })
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, actor.userId),
        eq(decisionTrace.agent, "drop_directions"),
        eq(decisionTrace.step, "directions.qloo"),
        gt(decisionTrace.at, new Date(Date.now() - 60 * MINUTE_MS))
      )
    );
  return used?.runs ?? 0;
};

export interface DirectionsInput {
  // "Ignore my brand this time": suggest across audiences.
  ignoreBrand: boolean;
  // "Show me others" (open mode).
  round: number;
}

export const dropDirections = async (
  actor: Actor,
  input: DirectionsInput
): Promise<Directions & { hasBrand: boolean }> => {
  if (!(await directionsOn(actor))) {
    throw directionsOff();
  }
  await assertQlooOn(actor);
  if ((await directionsUsed(actor)) >= DIRECTIONS_PER_HOUR) {
    throw directionsExhausted();
  }
  const [[brand], locale] = await Promise.all([
    actor.db
      .select({
        demographics: brandProfile.demographics,
        niches: brandProfile.niches,
        qlooEntities: brandProfile.qlooEntities,
        voice: brandProfile.voice,
      })
      .from(brandProfile)
      .where(eq(brandProfile.userId, actor.userId)),
    localeOf(actor),
  ]);
  const saved =
    brand !== undefined && brand.qlooEntities.length > 0 ? brand : undefined;
  const directions = await traced(
    actor,
    async (trace) =>
      await suggestDirections(
        {
          ask: actor.core.nemotron,
          locale,
          log: actor.log,
          qloo: actor.core.qloo,
          tavily: actor.core.tavily,
          trace,
        },
        {
          brand:
            saved === undefined || input.ignoreBrand
              ? undefined
              : {
                  ageAffinity: saved.demographics.ageAffinity,
                  entities: saved.qlooEntities,
                  genders: saved.demographics.genders,
                  niches: saved.niches,
                  voice: saved.voice,
                },
          round: input.round,
          salt: actor.userId,
        }
      )
  );
  return { ...directions, hasBrand: saved !== undefined };
};
