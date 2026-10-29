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
import { brandProfile } from "@wovain/db/schema/autonomy";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";

// Qloo's audience for the merchant's brand as Meta targeting
// (@wovain/core/targeting). Every campaign calls `audienceFor` before it
// stages an ad set; the copy writer gets its persona. The steps and every
// Qloo and Meta match are saved as a decision trace. No Qloo audience, no
// campaign (`requireQlooAudience`).

const BRAND_TYPE = "urn:entity:brand";
const MAX_REFERENCES = 5;
// One status for both reasons, so the declared error keeps its type; the
// data's reason and fix tell a retry from a brand fix.
const UNPROCESSABLE = 422;

const NO_AUDIENCE_FIX =
  "Add a brand you love to your brand profile (one Qloo knows, like Supreme or Patagonia), then make the ads again.";
const FAILED_FIX = "Make the ads again in a minute.";

// Procedures declare these (`.errors(audienceErrors)`), so the drop flow
// reads `error.code` and shows the fix with a retry.
export const audienceErrors = {
  QLOO_AUDIENCE_MISSING: {
    data: z.object({
      fix: z.string(),
      reason: z.enum(["failed", "no_audience"]),
    }),
    message: "No ads were made: wovain found no Qloo audience for your brand",
    status: UNPROCESSABLE,
  },
} as const;

// Throws QLOO_AUDIENCE_MISSING unless the targeting carries a Qloo audience
// and every step behind it worked. Thrown inside a keyed write (./once), so
// nothing is saved and a retry asks Qloo again.
export const requireQlooAudience = (targeting: AudienceTargeting) => {
  const gap = qlooAudienceGap(targeting.evidence);
  if (gap === undefined) {
    return targeting;
  }
  const failed = gap.reason === "failed";
  throw new ORPCError("QLOO_AUDIENCE_MISSING", {
    data: { fix: failed ? FAILED_FIX : NO_AUDIENCE_FIX, reason: gap.reason },
    message: failed
      ? `No ads were made: wovain couldn't reach Qloo's audience for your brand (${gap.steps.join(", ")} failed)`
      : audienceErrors.QLOO_AUDIENCE_MISSING.message,
    status: UNPROCESSABLE,
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
