import { buildAudienceTargeting, reportFailure } from "@wovain/core/targeting";
import type {
  AudienceTargeting,
  QlooEntityInput,
} from "@wovain/core/targeting";
import { DecisionTrace } from "@wovain/core/trace";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { eq } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { flagContextOf } from "./flags";

// Qloo's audience for the merchant's brand as Meta targeting
// (@wovain/core/targeting), behind the qloo-audiences flag. Media buying
// calls `audienceFor` before it stages an ad set; the copy writer gets its
// persona. The steps and every Qloo and Meta match are saved as a decision
// trace.

const BRAND_TYPE = "urn:entity:brand";
const MAX_REFERENCES = 5;

export const qlooAudiencesOn = async (actor: Actor) =>
  await actor.core.flags.isOn("qloo-audiences", flagContextOf(actor));

export const requireQlooAudiences = async (actor: Actor) => {
  if (!(await qlooAudiencesOn(actor))) {
    throw createError({
      fix: "Turn on the qloo-audiences flag for this environment.",
      message: "Qloo audience targeting isn't available yet",
      status: 404,
      why: "The qloo-audiences flag is off.",
    });
  }
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
  const ids = new Set(saved.map((entity) => entity.id));
  return [
    ...saved,
    ...found.flat().filter((entity) => {
      const fresh = !ids.has(entity.id);
      ids.add(entity.id);
      return fresh;
    }),
  ];
};

export interface AudienceRequest {
  countries: string[];
  // Links the trace to a run or drop when there is one.
  dropId?: string | undefined;
  runId?: string | undefined;
}

export const audienceFor = async (
  actor: Actor,
  { countries, dropId, runId }: AudienceRequest
): Promise<AudienceTargeting> => {
  const [profile] = await actor.db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  const trace = new DecisionTrace(
    { dropId, runId, userId: actor.userId },
    traceSinkFor(actor)
  );
  const entities = await entitiesOf(actor, profile);
  const targeting = await buildAudienceTargeting(
    {
      interests: actor.core.metaInterests,
      log: actor.log,
      qloo: actor.core.qloo,
      trace,
    },
    {
      countries,
      entities,
      override: profile?.demographics,
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
