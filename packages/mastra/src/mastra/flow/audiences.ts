import { ORPCError } from "@orpc/server";
import {
  buildAudienceTargeting,
  qlooAudienceGap,
  reportFailure,
} from "@wovain/core/targeting";
import type {
  AudienceTargeting,
  QlooEntityInput,
} from "@wovain/core/targeting";
import { DecisionTrace } from "@wovain/core/trace";
import type { WhoBuys } from "@wovain/core/who-buys";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { getIdea } from "./ideas";
import { ideaWhoBuys, whoBuysOn } from "./who-buys";

// Qloo's audience for the drop as Meta targeting (@wovain/core/targeting).
// Every campaign calls `audienceFor` before it stages an ad set; the copy
// writer gets its persona. The sources, in order: the idea's own Qloo data
// (its who-buys audiences and brands, its tag and cues), then the brand,
// if there is one, then the brief's Qloo entities. The brand is optional
// ("just sell"): with no Qloo audience at all the ads go broad on the
// idea's interests. Only a failed Qloo or Meta step refuses the ads
// (`requireQlooAudience`). Every step is saved as a decision trace.

const BRAND_TYPE = "urn:entity:brand";
const MAX_REFERENCES = 5;
const UNPROCESSABLE = 422;
// The idea's cues searched on Meta next to its tag.
const MAX_CUES = 3;

const FAILED_FIX = "Make the ads again in a minute.";

// Procedures declare these (`.errors(audienceErrors)`), so the drop flow
// reads `error.code` and shows the fix with a retry.
export const audienceErrors = {
  QLOO_AUDIENCE_MISSING: {
    data: z.object({
      fix: z.string(),
      reason: z.enum(["failed"]),
    }),
    message: "No ads were made: wovain couldn't reach Qloo's audience",
    status: UNPROCESSABLE,
  },
} as const;

// Throws QLOO_AUDIENCE_MISSING when a step behind the targeting failed.
// Thrown inside a keyed write (./once), so nothing is saved and a retry asks
// Qloo again. A missing brand or audience never throws (evidence.fallback).
export const requireQlooAudience = (targeting: AudienceTargeting) => {
  const gap = qlooAudienceGap(targeting.evidence);
  if (gap === undefined) {
    return targeting;
  }
  throw new ORPCError("QLOO_AUDIENCE_MISSING", {
    data: { fix: FAILED_FIX, reason: gap.reason },
    message: `No ads were made: wovain couldn't reach Qloo's audience (${gap.steps.join(", ")} failed)`,
    status: UNPROCESSABLE,
  });
};

// The idea's who-buys: kept on the idea during the run (#318), else read
// now. Best effort: without it the brand and brief still target.
const whoBuysOf = async (
  actor: Actor,
  row: Awaited<ReturnType<typeof getIdea>>
): Promise<WhoBuys | null> => {
  if (row.whoBuys !== null || !(await whoBuysOn(actor))) {
    return row.whoBuys;
  }
  try {
    return await ideaWhoBuys(actor, row.id);
  } catch (error) {
    reportFailure(actor.log, "who_buys", error);
    return null;
  }
};

// The idea's Qloo signals for targeting: its who-buys audiences and brands,
// its tag and cues (Meta interest searches) and the brief's entities.
const ideaSignals = async (actor: Actor, ideaId: string) => {
  const row = await getIdea(actor, ideaId);
  const { cues, qlooTag, taste } = row.research;
  const found = await whoBuysOf(actor, row);
  const tag = taste?.tag?.name ?? row.theme;
  return {
    audiences: found?.audiences ?? [],
    brands: (found?.brands ?? []).map(({ id, name }) => ({
      id,
      name,
      type: BRAND_TYPE,
    })),
    brief: (taste?.seeds ?? []).map(({ id, name, type }) => ({
      id,
      name,
      type,
    })),
    queries: [tag, ...(cues ?? []).slice(0, MAX_CUES)].map((query) => ({
      qlooId: qlooTag ?? tag,
      query,
    })),
  };
};

const unique = (entities: readonly QlooEntityInput[]) => {
  const ids = new Set<string>();
  return entities.filter((entity) => {
    const fresh = !ids.has(entity.id);
    ids.add(entity.id);
    return fresh;
  });
};

// The brand's Qloo entities: the wizard's, plus Qloo brands for its taste
// references when it has none (Qloo scores audiences against brands only).
const entitiesOf = async (
  actor: Actor,
  profile: typeof brandProfile.$inferSelect | undefined
): Promise<QlooEntityInput[]> => {
  const saved = (profile?.qlooEntities ?? []).map(({ id, name, type }) => ({
    id,
    name,
    type,
  }));
  if (saved.some((entity) => entity.type === BRAND_TYPE)) {
    return saved;
  }
  const references = [
    ...(profile?.tasteReferences ?? []),
    ...(profile?.niches ?? []),
  ].slice(0, MAX_REFERENCES);
  const found = await Promise.all(
    references.map(async (reference) => {
      try {
        const [brand] = await actor.core.qloo.searchEntities(
          reference,
          [BRAND_TYPE],
          1,
          actor.log
        );
        return brand === undefined
          ? []
          : [{ id: brand.id, name: brand.name, type: BRAND_TYPE }];
      } catch (error) {
        // One reference Qloo can't resolve leaves the others.
        reportFailure(actor.log, "qloo.search", error);
        return [];
      }
    })
  );
  return unique([...saved, ...found.flat()]);
};

export interface AudienceRequest {
  countries: string[];
  // Links the trace to a run or drop when there is one.
  dropId?: string | undefined;
  // The drop's idea: its Qloo data targets first.
  ideaId?: string | undefined;
  runId?: string | undefined;
}

export const audienceFor = async (
  actor: Actor,
  { countries, dropId, ideaId, runId }: AudienceRequest
): Promise<AudienceTargeting> => {
  const [profile] = await actor.db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  const trace = new DecisionTrace(
    { dropId, runId, userId: actor.userId },
    traceSinkFor(actor)
  );
  const idea =
    ideaId === undefined ? undefined : await ideaSignals(actor, ideaId);
  const entities = unique([
    ...(idea?.brands ?? []),
    ...(await entitiesOf(actor, profile)),
    ...(idea?.brief ?? []),
  ]);
  const targeting = await buildAudienceTargeting(
    {
      interests: actor.core.metaInterests,
      log: actor.log,
      qloo: actor.core.qloo,
      trace,
    },
    {
      audiences: idea?.audiences,
      countries,
      entities,
      override: profile?.demographics,
      queries: idea?.queries,
    }
  );
  try {
    await trace.flush();
  } catch (error) {
    // The targeting stands without its saved trace; the failure is logged.
    reportFailure(actor.log, "trace.flush", error);
  }
  return targeting;
};
