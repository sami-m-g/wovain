// How a Meta campaign is aimed and measured when the media-buying-live flag
// is on (openspec change media-buying-live): Advantage+ audience with
// suggestions, the sales objective on a pixel, and UTM-tagged links.
// Structure follows Meta's Advantage+ guidance and the claude-ads and
// meta-ads-analyzer playbooks (MIT): one CBO campaign, one broad ad set,
// a few creative variants.

// The audience an ad set suggests to Advantage+ audience. Countries are hard
// limits; ages and genders are suggestions Meta may go beyond.
export interface AdTargeting {
  ageMax?: number | undefined;
  ageMin?: number | undefined;
  countries: string[];
  genders?: ("all" | "female" | "male")[] | undefined;
}

// What the media-buying-live flag adds to a staging.
export interface MediaBuying {
  // The Meta pixel (dataset) that sees the shop's purchases: Fourthwall's
  // native Meta pixel and CAPI integration sends them. Without one the
  // campaign drives landing page views instead.
  pixelId?: string | undefined;
  targeting: AdTargeting;
}

const META_MIN_AGE = 18;
const META_GENDER = { female: 2, male: 1 } as const;

export const adSetTargeting = (targeting: AdTargeting) => {
  const genders = targeting.genders ?? [];
  const narrowed =
    genders.length > 0 && !genders.includes("all")
      ? [
          ...new Set(
            genders.map(
              (gender) => META_GENDER[gender as keyof typeof META_GENDER]
            )
          ),
        ]
      : [];
  return {
    ...(targeting.ageMax === undefined ? {} : { age_max: targeting.ageMax }),
    ...(targeting.ageMin === undefined
      ? {}
      : { age_min: Math.max(META_MIN_AGE, targeting.ageMin) }),
    ...(narrowed.length === 0 ? {} : { genders: narrowed }),
    geo_locations: { countries: targeting.countries },
    // Meta recommends Advantage+ audience; the server would turn it on
    // anyway, so it is said out loud.
    targeting_automation: { advantage_audience: 1 },
  };
};

// The objective, goal and promoted object of a staging: purchases on the
// pixel when there is one, landing page views otherwise (Meta allows no
// website goal under OUTCOME_SALES without a conversion signal).
export const deliveryOf = (media: MediaBuying | undefined) => {
  if (media === undefined) {
    return {
      adSet: { optimization_goal: "LINK_CLICKS" },
      objective: "OUTCOME_TRAFFIC",
    };
  }
  if (media.pixelId === undefined) {
    return {
      adSet: { optimization_goal: "LANDING_PAGE_VIEWS" },
      objective: "OUTCOME_TRAFFIC",
    };
  }
  return {
    adSet: {
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: JSON.stringify({
        custom_event_type: "PURCHASE",
        pixel_id: media.pixelId,
      }),
    },
    objective: "OUTCOME_SALES",
  };
};

// Tags a product link so Fourthwall's sales-by-UTM report credits the ad.
export const withUtm = (
  link: string,
  { campaign, content }: { campaign: string; content: string }
) => {
  const url = new URL(link);
  url.searchParams.set("utm_source", "meta");
  url.searchParams.set("utm_medium", "paid_social");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.toString();
};
