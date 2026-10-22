import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { DraftPlan } from "./campaign-plan.ts";

// What wovain lets the agent send to Meta's Ads MCP for the campaign draft:
// an allowlist of argument keys per tool, nested JSON checked too, unknown
// keys rejected. Budgets and bids are wovain's (the plan's daily budget on
// the campaign, none anywhere else). Meta's create tools take no status: each
// object is staged paused in the ad account's draft, and a status key is
// rejected, so only launch_campaign (ads_activate_entity) can publish.

// Every Meta Ads call is for the merchant's launch job.
export const ADVERTISER_JOB = "create_and_launch_new_ads";

type Args = Record<string, unknown>;

const id = z.string().regex(/^\d{1,30}$/u);
const name = z.string().min(1).max(400);
const httpsUrl = z.url({ protocol: /^https$/u });

const common = {
  ad_account_id: id,
  // Accepted, then set by wovain.
  advertiser_job: z.string().optional(),
  advertiser_request: z.string().max(2000).optional(),
  client_conversation_id: z.string().regex(/^[A-Za-z0-9]{20}$/u),
  client_model: z
    .string()
    .regex(/^[\w.-]{1,64}$/u)
    .optional(),
  hide_ui: z.boolean().optional(),
};

// Meta takes these nested specs as JSON strings; the agent may send either a
// string or the object. Checked as objects, sent as strings.
const jsonSpec = <T extends z.ZodType>(schema: T) =>
  z
    .preprocess((value) => {
      if (typeof value !== "string") {
        return value;
      }
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }, schema)
    .transform((value) => JSON.stringify(value));

const drafts = {
  ads_create_ad: z.strictObject({
    ...common,
    ad_name: name,
    ad_set_id: id,
    creative: jsonSpec(z.strictObject({ creative_id: id })),
  }),
  ads_create_ad_set: z.strictObject({
    ...common,
    ad_set_name: name,
    billing_event: z.literal("IMPRESSIONS"),
    campaign_id: id,
    destination_type: z.literal("WEBSITE"),
    optimization_goal: z.literal("OFFSITE_CONVERSIONS"),
    promoted_object: jsonSpec(
      z.strictObject({ custom_event_type: z.literal("PURCHASE"), pixel_id: id })
    ),
    targeting: jsonSpec(
      z.strictObject({
        geo_locations: z.strictObject({
          countries: z
            .array(z.string().regex(/^[A-Z]{2}$/u))
            .min(1)
            .max(50),
        }),
      })
    ),
  }),
  // The budget is accepted so the agent can pass the plan's, then replaced
  // with it.
  ads_create_campaign: z.strictObject({
    ...common,
    buying_type: z.literal("AUCTION"),
    campaign_daily_budget: z.int().positive().optional(),
    campaign_name: name,
    objective: z.literal("OUTCOME_SALES"),
    special_ad_categories: jsonSpec(z.tuple([])).optional(),
  }),
  ads_create_creative: z.strictObject({
    ...common,
    call_to_action_type: z.literal("SHOP_NOW"),
    image_hash: z.string().regex(/^[\da-f]{32}$/iu),
    instagram_user_id: id.optional(),
    link_url: httpsUrl,
    message: z.string().min(1).max(2000),
    name: name.optional(),
    page_id: id,
    self_ai_disclosure: z.enum(["OPT_IN", "OPT_OUT"]),
    video_id: id,
  }),
  ads_creative_upload_media: z.strictObject({
    ...common,
    media_type: z.enum(["IMAGE", "VIDEO"]),
    media_url: httpsUrl,
    name: name.optional(),
    upload_source: z.literal("URL").optional(),
  }),
} as const;

export const draftToolSchema = z.enum([
  "ads_create_ad",
  "ads_create_ad_set",
  "ads_create_campaign",
  "ads_create_creative",
  "ads_creative_upload_media",
]);
type DraftTool = z.infer<typeof draftToolSchema>;

// Plan checks the schemas can't make alone: uploads only of the added ads'
// media, links only to their products, and the ad set under the campaign
// wovain staged. An empty string means the arguments fit the plan.
const outsidePlan = (tool: DraftTool, args: Args, plan: DraftPlan) => {
  if (
    tool === "ads_creative_upload_media" &&
    !plan.mediaUrls.includes(String(args["media_url"]))
  ) {
    return "media_url isn't one of the added ads' images or videos";
  }
  if (
    tool === "ads_create_creative" &&
    !plan.linkUrls.includes(String(args["link_url"]))
  ) {
    return "link_url isn't an added product's link (with the plan's URL tags)";
  }
  if (tool === "ads_create_ad_set" && args["campaign_id"] !== plan.campaignId) {
    return "campaign_id isn't the campaign wovain staged";
  }
  return "";
};

// The arguments wovain sends for one draft call, or an error naming what it
// refused. wovain sets the job, hides Meta's widgets in favor of its own,
// uploads by URL only and puts the plan's budget on the campaign.
export const draftArgs = (
  tool: DraftTool,
  args: Args,
  plan: DraftPlan
): Args => {
  const parsed = drafts[tool].safeParse(args);
  if (!parsed.success) {
    throw new Error(
      `campaign_draft refused these ${tool} arguments: ${z.prettifyError(parsed.error)}`
    );
  }
  const problem = outsidePlan(tool, parsed.data, plan);
  if (problem !== "") {
    throw new Error(`campaign_draft refused ${tool}: ${problem}.`);
  }
  return {
    ...parsed.data,
    advertiser_job: ADVERTISER_JOB,
    hide_ui: true,
    ...(tool === "ads_create_campaign" && {
      campaign_daily_budget: plan.dailyBudgetCents,
    }),
    ...(tool === "ads_creative_upload_media" && { upload_source: "URL" }),
  };
};

// A client_conversation_id for a call the merchant started from a widget,
// outside the chat's Meta calls: 20 letters and digits, as Meta asks.
export const newConversationId = () =>
  randomBytes(20)
    .toString("base64")
    .replaceAll(/[^A-Za-z\d]/gu, "")
    .padEnd(20, "0")
    .slice(0, 20);

// Every object in a Meta reply that has an ad_object_id, wherever it sits
// (ads_get_ad_entities with object_state "draft").
const entitiesIn = (value: unknown): Args[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => entitiesIn(item));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const entries = Object.entries(value);
  const own = entries.some(([key]) => key === "ad_object_id")
    ? [Object.fromEntries(entries)]
    : [];
  return [...own, ...entries.flatMap(([, item]) => entitiesIn(item))];
};

const amount = (entity: Args, keys: string[]) =>
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

// The campaign's draft read back before publishing: its object IDs, and
// what doesn't match the plan (objective, daily budget, no other budget,
// cap or bid anywhere). Publishing stops on any mismatch.
export const checkDraft = (
  reply: unknown,
  campaignId: string,
  dailyBudgetCents: number
) => {
  const found = entitiesIn(reply);
  const ids = [
    ...new Set(found.map((entity) => String(entity["ad_object_id"]))),
  ];
  const campaign = found.find(
    (entity) => String(entity["ad_object_id"]) === campaignId
  );
  const others = found.filter((entity) => entity !== campaign);
  const problems = [
    ...(campaign === undefined ? ["the campaign isn't in the draft"] : []),
    ...(campaign !== undefined && campaign["objective"] !== "OUTCOME_SALES"
      ? ["the objective isn't sales"]
      : []),
    ...(campaign !== undefined && amount(campaign, DAILY) !== dailyBudgetCents
      ? ["the daily budget isn't the plan's"]
      : []),
    ...(campaign !== undefined && amount(campaign, CAMPAIGN_CAPS) > 0
      ? ["the campaign has a lifetime budget or spend cap"]
      : []),
    ...(others.some((entity) => amount(entity, AD_SET_SPEND) > 0)
      ? ["an ad set or ad has its own budget, cap or bid"]
      : []),
  ];
  return { ids, problems };
};

// The fields launch_campaign reads back.
export const CHECKED_FIELDS = [
  "objective",
  ...DAILY,
  ...CAMPAIGN_CAPS,
  ...AD_SET_SPEND,
];

// The campaign ID in Meta's reply to ads_create_campaign.
export const stagedCampaignId = (reply: unknown): string | undefined => {
  if (typeof reply !== "object" || reply === null) {
    return undefined;
  }
  const entries = Object.entries(reply);
  const own: unknown = entries.find(([key]) => key === "campaign_id")?.[1];
  if (typeof own === "string" && /^\d+$/u.test(own)) {
    return own;
  }
  return entries
    .map(([, item]) => stagedCampaignId(item))
    .find((found) => found !== undefined);
};
