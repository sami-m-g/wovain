import { z } from "zod";

import { canonicalJson } from "./meta-staged.ts";
import type { Staged, StagedCreative } from "./meta-staged.ts";

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
  "promoted_object",
  "optimization_goal",
  "bid_strategy",
  "adset_id",
  "campaign_id",
  "creative_id",
  ...new Set([...DAILY, ...CAMPAIGN_CAPS, ...AD_SET_SPEND]),
];

// The fields it reads for the creatives (all in the Meta Ads MCP's
// ads_get_creatives list): `images` and `child_attachments` carry a
// multi-media pool's and a carousel's media and links.
export const CREATIVE_FIELDS = [
  "link_url",
  "video_id",
  "image_hash",
  "images",
  "child_attachments",
  "call_to_action_type",
  "object_story_id",
  "effective_object_story_id",
];

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

type StagedAdSet = Staged["adSets"][number];
type StagedAd = Staged["ads"][number];

// An ad set must still have exactly the targeting, promoted object and goal
// wovain sent, and no bid strategy of its own.
const adSetProblems = (entity: Entity, set: StagedAdSet) => {
  const name = `ad set ${set.id}`;
  return [
    ...(canonicalJson(entity["targeting"]) === set.targeting
      ? []
      : [`${name}'s targeting changed`]),
    ...(canonicalJson(entity["promoted_object"]) === set.promotedObject
      ? []
      : [`${name}'s promoted object changed`]),
    ...(entity["optimization_goal"] === set.optimizationGoal
      ? []
      : [`${name}'s optimization goal changed`]),
    ...(entity["bid_strategy"] === undefined ||
    entity["bid_strategy"] === "LOWEST_COST_WITHOUT_CAP"
      ? []
      : [`${name} has a bid strategy`]),
  ];
};

// An ad must still join the ad set and creative wovain staged it with.
const adProblems = (entity: Entity, ad: StagedAd, campaignId: string) =>
  text(entity["creative_id"]) === ad.creativeId &&
  text(entity["adset_id"]) === ad.adSetId &&
  text(entity["campaign_id"]) === campaignId
    ? []
    : [`ad ${ad.id} isn't on its staged ad set or creative`];

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
  const adSets = new Map(staged.adSets.map((set) => [set.id, set]));
  const ads = new Map(staged.ads.map((ad) => [ad.id, ad]));
  const recorded = new Set([
    staged.campaignId,
    ...adSets.keys(),
    ...ads.keys(),
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
      const set = adSets.get(idOf(entity));
      const ad = ads.get(idOf(entity));
      return [
        ...(set === undefined ? [] : adSetProblems(entity, set)),
        ...(ad === undefined ? [] : adProblems(entity, ad, staged.campaignId)),
      ];
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

// Every string under one of `keys` anywhere in a read-back creative, so a
// value is found whether Meta returns it flat, in object_story_spec
// (link_data, video_data, child_attachments) or in asset_feed_spec (images
// `hash`, videos, link_urls `website_url`).
const valuesUnder = (value: unknown, keys: ReadonlySet<string>): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => valuesUnder(item, keys));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => [
    ...(keys.has(key) && (typeof item === "string" || typeof item === "number")
      ? [String(item)]
      : []),
    ...valuesUnder(item, keys),
  ]);
};

const HASH_KEYS = new Set(["image_hash", "hash", "thumbnail_hash"]);
const VIDEO_KEYS = new Set(["video_id"]);
const LINK_KEYS = new Set(["link_url", "link", "website_url"]);
const CTA_KEYS = new Set(["call_to_action_type"]);

// A call_to_action object's `type`, wherever it sits.
const ctaTypes = (entity: Entity) =>
  objectsWith(entity, "call_to_action").flatMap((item) => {
    const cta = item["call_to_action"];
    return typeof cta === "object" && cta !== null && "type" in cta
      ? [text(cta.type)]
      : [];
  });

const all = (values: readonly string[], within: ReadonlySet<string>) =>
  values.every((value) => within.has(value));

// What the creative's shape must show on its own: the single video or
// image, every visual of a multi-media pool, every carousel card in order.
const shapeFits = (entity: Entity, creative: StagedCreative) => {
  const hashes = new Set(valuesUnder(entity, HASH_KEYS));
  const videos = new Set(valuesUnder(entity, VIDEO_KEYS));
  switch (creative.shape) {
    case "video": {
      const image = entity["image_hash"];
      return (
        text(entity["link_url"]) === creative.linkUrl &&
        text(entity["video_id"]) === creative.videoIds[0] &&
        (image === undefined || text(image) === creative.imageHashes[0])
      );
    }
    case "image": {
      return (
        text(entity["link_url"]) === creative.linkUrl &&
        text(entity["image_hash"]) === creative.imageHashes[0]
      );
    }
    case "multi_media": {
      return (
        all(creative.imageHashes, hashes) && all(creative.videoIds, videos)
      );
    }
    case "carousel": {
      const children = z
        .array(z.looseObject({ image_hash: z.unknown(), link: z.unknown() }))
        .safeParse(entity["child_attachments"]).data;
      return (
        children !== undefined &&
        children.length === creative.cards.length &&
        creative.cards.every(
          (card, index) =>
            text(children[index]?.link) === card.link &&
            text(children[index]?.image_hash) === card.imageHash
        )
      );
    }
    default: {
      return false;
    }
  }
};

// The creatives read back (ads_get_creatives): each one wovain made must
// still have its shape's media, only media wovain uploaded for it, only its
// own product links (each an allowed one), its CTA and its Page. A value
// the read-back doesn't show fails closed.
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
    const links = valuesUnder(entity, LINK_KEYS);
    const ownLinks = new Set([
      creative.linkUrl,
      ...creative.cards.map((card) => card.link),
    ]);
    const ctas = [...valuesUnder(entity, CTA_KEYS), ...ctaTypes(entity)];
    const fits =
      links.length > 0 &&
      all(links, ownLinks) &&
      all(links, allowed) &&
      all(valuesUnder(entity, HASH_KEYS), new Set(creative.imageHashes)) &&
      all(valuesUnder(entity, VIDEO_KEYS), new Set(creative.videoIds)) &&
      ctas.length > 0 &&
      all(ctas, new Set([creative.cta])) &&
      (story === "" || story.split("_")[0] === creative.pageId) &&
      shapeFits(entity, creative);
    return fits ? [] : [`creative ${creative.id} changed`];
  });
};
