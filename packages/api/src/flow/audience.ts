import type { AdTargeting } from "@wovain/core/ad-delivery";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";

// Who an ad set suggests to Meta's Advantage+ audience (openspec change
// media-buying-live). This is the seam for workstream 2b (qloo-audiences):
// it fills brand_profile.demographics from Qloo, or replaces
// `audienceFor` with a Qloo-backed source of the same type. The merchant's
// chosen countries always stay the hard limit.

export interface AudienceRequest {
  // ISO country codes the merchant chose for the campaign.
  countries: string[];
  productId: string;
}

export type AudienceSource = (
  actor: Pick<Actor, "db" | "userId">,
  request: AudienceRequest
) => Promise<AdTargeting>;

// The brand's own demographics (the onboarding wizard or Qloo write them):
// ages and genders become suggestions; with none, broad Advantage+.
const brandAudience: AudienceSource = async (actor, request) => {
  const [row] = await actor.db
    .select({ demographics: brandProfile.demographics })
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  const demographics = row?.demographics ?? {};
  return {
    ageMax: demographics.ageMax,
    ageMin: demographics.ageMin,
    countries: request.countries,
    genders: demographics.genders,
  };
};

export const audienceFor: AudienceSource = brandAudience;
