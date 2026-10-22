import { z } from "zod";

import type { Staged } from "./meta-staged.ts";

// launch_campaign's last check before spending: the staged draft and its
// creatives read back from Meta must hold exactly what wovain recorded, and
// match the plan. Anything else stops the launch (fail closed).

type Entity = Record<string, unknown>;

// Every object in a Meta reply that has `key`, wherever it sits.
const objectsWith = (value: unknown, key: string): Entity[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => objectsWith(item, key));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const entries = Object.entries(value);
  const own = entries.some(([name]) => name === key)
    ? [Object.fromEntries(entries)]
    : [];
  return [...own, ...entries.flatMap(([, item]) => objectsWith(item, key))];
};

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const amount = (entity: Entity, keys: string[]) =>
  keys
    .map((key) => Number(entity[key] ?? 0))
    .find((value) => Number.isFinite(value) && value > 0) ?? 0;

const DAILY = ["daily_budget", "campaign_daily_budget"];
const CAMPAIGN_CAPS = [
  "lifetime_budget",
  "campaign_lifetime_budget",
  "spend_cap",
  "campaign_spend_cap",
];
const AD_SET_SPEND = [
  "daily_budget",
  "lifetime_budget",
  "daily_spend_cap",
  "lifetime_spend_cap",
  "bid_amount",
];

// The fields launch_campaign asks for when it reads the draft back.
export const CHECKED_FIELDS = [
  "objective",
  "targeting",
  "bid_strategy",
  ...new Set([...DAILY, ...CAMPAIGN_CAPS, ...AD_SET_SPEND]),
];

// The fields it reads for the creatives.
export const CREATIVE_FIELDS = [
  "link_url",
  "video_id",
  "image_hash",
  "object_story_id",
  "effective_object_story_id",
];

const countriesOf = (targeting: unknown) => {
  const parsed: unknown =
    typeof targeting === "string" ? JSON.parse(targeting) : targeting;
  const countries =
    z
      .object({ geo_locations: z.object({ countries: z.array(z.string()) }) })
      .safeParse(parsed).data?.geo_locations.countries ?? [];
  return [...countries].toSorted().join(",");
};

const campaignProblems = (
  campaign: Entity | undefined,
  dailyBudgetCents: number
) => {
  if (campaign === undefined) {
    return ["the campaign isn't in the draft"];
  }
  return [
    ...(campaign["objective"] === "OUTCOME_SALES"
      ? []
      : ["the objective isn't sales"]),
    ...(amount(campaign, DAILY) === dailyBudgetCents
      ? []
      : ["the daily budget isn't the plan's"]),
    ...(amount(campaign, CAMPAIGN_CAPS) > 0
      ? ["the campaign has a lifetime budget or spend cap"]
      : []),
  ];
};

const adSetProblems = (entity: Entity, countries: string) => [
  ...(countriesOf(entity["targeting"]) === countries
    ? []
    : [`ad set ${text(entity["ad_object_id"])}'s targeting changed`]),
  ...(entity["bid_strategy"] === undefined ||
  entity["bid_strategy"] === "LOWEST_COST_WITHOUT_CAP"
    ? []
    : [`ad set ${text(entity["ad_object_id"])} has a bid strategy`]),
];

const idOf = (entity: Entity) => text(entity["ad_object_id"]);

// The draft read back (ads_get_ad_entities, object_state "draft"): the IDs
// to publish (recorded and read back) and what doesn't match, including any
// recorded object Meta didn't return.
export const checkDraft = (
  reply: unknown,
  staged: Staged,
  dailyBudgetCents: number
) => {
  const found = objectsWith(reply, "ad_object_id");
  const adSets = new Map(
    staged.adSets.map((set) => [set.id, set.countries.toSorted().join(",")])
  );
  const recorded = new Set([
    staged.campaignId,
    ...adSets.keys(),
    ...staged.ads.map((ad) => ad.id),
  ]);
  const campaign = found.find((entity) => idOf(entity) === staged.campaignId);
  const readBack = new Set(found.map((entity) => idOf(entity)));
  const problems = [
    ...[...recorded].flatMap((id) =>
      readBack.has(id) ? [] : [`${id} wasn't read back`]
    ),
    ...found.flatMap((entity) =>
      recorded.has(idOf(entity))
        ? []
        : [`${idOf(entity)} wasn't staged by wovain`]
    ),
    ...campaignProblems(campaign, dailyBudgetCents),
    ...found.flatMap((entity) => {
      const countries = adSets.get(idOf(entity));
      return countries === undefined ? [] : adSetProblems(entity, countries);
    }),
    ...(found.some(
      (entity) => entity !== campaign && amount(entity, AD_SET_SPEND) > 0
    )
      ? ["an ad set or ad has its own budget, cap or bid"]
      : []),
  ];
  // Only objects both recorded and read back; any gap is a problem above.
  return {
    objectIds: [...recorded].filter((id) => readBack.has(id)),
    problems,
  };
};

// The creatives read back (ads_get_creatives): each one wovain made must
// still have its product link, video, thumbnail and Page.
export const checkCreatives = (
  reply: unknown,
  staged: Staged,
  linkUrls: readonly string[]
) => {
  const found = new Map(
    objectsWith(reply, "id").map((entity) => [text(entity["id"]), entity])
  );
  const allowed = new Set(linkUrls);
  return staged.creatives.flatMap((creative) => {
    const entity = found.get(creative.id);
    if (entity === undefined) {
      return [`creative ${creative.id} wasn't read back`];
    }
    const story = text(
      entity["object_story_id"] ?? entity["effective_object_story_id"]
    );
    const link = text(entity["link_url"]);
    const image = entity["image_hash"];
    const fits =
      link === creative.linkUrl &&
      allowed.has(link) &&
      text(entity["video_id"]) === creative.videoId &&
      (image === undefined || text(image) === creative.imageHash) &&
      (story === "" || story.split("_")[0] === creative.pageId);
    return fits ? [] : [`creative ${creative.id} changed`];
  });
};
