import { randomInt } from "node:crypto";

import { z } from "zod";

import type { Logger } from "./log";
import type { Nemotron } from "./nemotron";
import { findAll, findOne } from "./upstream";
import type { ToolCall } from "./upstream";

// Meta ads for a published product, through the Meta Ads MCP server on the
// merchant's own account: Nemotron writes varied ad copy, then wovain stages
// a traffic campaign with one ad set and one ad per variant. Everything is
// created PAUSED (or as a draft); wovain never activates spend.

export const copySchema = z.object({
  variants: z
    .array(
      z.object({
        // The angle this variant tries: humor, identity, gift, urgency…
        angle: z.string().min(1).max(40),
        headline: z.string().min(1).max(40),
        message: z.string().min(1).max(250),
      })
    )
    .min(2)
    .max(3),
});
export type AdCopy = z.infer<typeof copySchema>["variants"];

export const writeAdCopy = async (
  ask: Nemotron,
  product: { description: string; idea: string; title: string },
  log?: Logger
): Promise<AdCopy> => {
  const { variants } = await ask({
    log,
    name: "ad_copy",
    prompt: JSON.stringify(product),
    schema: copySchema,
    system:
      "You write Meta ads for a print-on-demand t-shirt. Write 2 or 3 variants, each with a different angle, a headline under 40 characters and primary text under 250. No prices, no claims you can't back, no brand or celebrity names.",
    temperature: 0.8,
  });
  return variants;
};

export interface CampaignPlan {
  // Numeric, without "act_"; the merchant's first MCP-enabled account if unset.
  adAccountId?: string | undefined;
  copy: AdCopy;
  // ISO country codes the ad set targets.
  countries: string[];
  dailyBudgetCents: number;
  imageUrl: string;
  linkUrl: string;
  name: string;
  // The Page the ads run as; the ad account's first Page if unset.
  pageId?: string | undefined;
}

export interface StagedCampaign {
  adAccountId: string;
  adIds: string[];
  adSetId: string;
  campaignId: string;
  creativeIds: string[];
  pageId: string;
}

const CONVERSATION_ID_LENGTH = 20;
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Meta's MCP asks every call of one job to carry the same conversation id.
export const conversationId = () =>
  Array.from(
    { length: CONVERSATION_ID_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("");

const idField = (key: string) =>
  z.object({ [key]: z.union([z.string().min(1), z.number()]) });

const idOf = (reply: unknown, key: string) =>
  String(findOne(idField(key), reply, key)[key]);

const resolveAccount = async (call: ToolCall, given?: string) => {
  if (given !== undefined) {
    return given;
  }
  const [account] = findAll(
    z.object({
      ad_account_id: z.union([z.string(), z.number()]),
      is_ads_mcp_enabled: z.literal(true),
    }),
    await call("ads_get_ad_accounts", {})
  );
  if (account === undefined) {
    throw new Error("The merchant has no Meta ad account open to wovain");
  }
  return String(account.ad_account_id);
};

const resolvePage = async (
  call: ToolCall,
  adAccountId: string,
  given?: string
) =>
  given ??
  idOf(
    await call("ads_get_ad_account_pages", { ad_account_id: adAccountId }),
    "page_id"
  );

export const stagePausedCampaign = async (
  call: ToolCall,
  plan: CampaignPlan
): Promise<StagedCampaign> => {
  const common = {
    advertiser_job: "create_and_launch_new_ads",
    client_conversation_id: conversationId(),
  };
  const meta = async (tool: string, args: Record<string, unknown>) =>
    await call(tool, { ...common, ...args });
  const adAccountId = await resolveAccount(meta, plan.adAccountId);
  const pageId = await resolvePage(meta, adAccountId, plan.pageId);
  const account = { ad_account_id: adAccountId };
  const campaignId = idOf(
    await meta("ads_create_campaign", {
      ...account,
      buying_type: "AUCTION",
      campaign_daily_budget: plan.dailyBudgetCents,
      campaign_name: plan.name,
      objective: "OUTCOME_TRAFFIC",
      special_ad_categories: "[]",
    }),
    "campaign_id"
  );
  const adSetId = idOf(
    await meta("ads_create_ad_set", {
      ...account,
      ad_set_name: `${plan.name} · broad`,
      billing_event: "IMPRESSIONS",
      campaign_id: campaignId,
      destination_type: "WEBSITE",
      optimization_goal: "LINK_CLICKS",
      targeting: JSON.stringify({
        geo_locations: { countries: plan.countries },
      }),
    }),
    "ad_set_id"
  );
  const creativeIds: string[] = [];
  const adIds: string[] = [];
  for (const [index, variant] of plan.copy.entries()) {
    const name = `${plan.name} · ${variant.angle}`;
    // One at a time: Meta's draft takes its objects in order.
    // oxlint-disable-next-line no-await-in-loop
    const creative = await meta("ads_create_creative", {
      ...account,
      call_to_action_type: "SHOP_NOW",
      headline: variant.headline,
      image_url: plan.imageUrl,
      link_url: plan.linkUrl,
      message: variant.message,
      name,
      page_id: pageId,
    });
    const creativeId = idOf(creative, "creative_id");
    creativeIds.push(creativeId);
    // oxlint-disable-next-line no-await-in-loop
    const ad = await meta("ads_create_ad", {
      ...account,
      ad_name: `${name} ${index + 1}`,
      ad_set_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
    });
    adIds.push(idOf(ad, "ad_id"));
  }
  return { adAccountId, adIds, adSetId, campaignId, creativeIds, pageId };
};
