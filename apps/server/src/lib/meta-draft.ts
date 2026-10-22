import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { DraftPlan } from "./campaign-plan.ts";
import type { Staged } from "./meta-staged.ts";

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

// What a draft call may build on: the plan, and the objects wovain already
// staged for the plan's campaign (from Meta's replies).
export type Plan = DraftPlan & { staged: Staged | undefined };

const has = (list: readonly string[], value: unknown) =>
  new Set(list).has(String(value));

// Plan checks the schemas can't make alone, per tool. An empty string means
// the arguments fit: uploads only of the added ads' media; creatives only
// with an added product's link and media wovain uploaded; ad sets only under
// the staged campaign; ads only joining a staged ad set and a creative
// wovain made.
const planChecks: Record<DraftTool, (args: Args, plan: Plan) => string> = {
  ads_create_ad: (args, { staged }) => {
    const creative = z
      .object({ creative_id: z.string() })
      .safeParse(JSON.parse(String(args["creative"]))).data?.creative_id;
    if (!has(staged?.adSets.map((set) => set.id) ?? [], args["ad_set_id"])) {
      return "ad_set_id isn't an ad set wovain staged under the campaign";
    }
    return has(staged?.creatives.map((item) => item.id) ?? [], creative)
      ? ""
      : "the creative isn't one wovain made";
  },
  ads_create_ad_set: (args, { campaignId, staged }) =>
    args["campaign_id"] === campaignId && staged?.campaignId === campaignId
      ? ""
      : "campaign_id isn't the campaign wovain staged",
  ads_create_campaign: () => "",
  ads_create_creative: (args, { linkUrls, staged }) => {
    if (!has(linkUrls, args["link_url"])) {
      return "link_url isn't an added product's link (with the plan's URL tags)";
    }
    if (!has(staged?.videos ?? [], args["video_id"])) {
      return "video_id isn't a video wovain uploaded";
    }
    return has(staged?.images ?? [], args["image_hash"])
      ? ""
      : "image_hash isn't an image wovain uploaded";
  },
  ads_creative_upload_media: (args, { mediaUrls }) =>
    has(mediaUrls, args["media_url"])
      ? ""
      : "media_url isn't one of the added ads' images or videos",
};

// The arguments wovain sends for one draft call, or an error naming what it
// refused. wovain sets the job, hides Meta's widgets in favor of its own,
// uploads by URL only and puts the plan's budget on the campaign.
export const draftArgs = (tool: DraftTool, args: Args, plan: Plan): Args => {
  const parsed = drafts[tool].safeParse(args);
  if (!parsed.success) {
    throw new Error(
      `campaign_draft refused these ${tool} arguments: ${z.prettifyError(parsed.error)}`
    );
  }
  const problem = planChecks[tool](parsed.data, plan);
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
