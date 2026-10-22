import { z } from "zod";

type Args = Record<string, unknown>;

// Budget and spend fields wovain sets itself: the campaign's daily budget is
// the plan's, and ad sets carry none (the budget lives on the campaign).
const campaignSpend = new Set([
  "campaign_lifetime_budget",
  "campaign_spend_cap",
]);
const adSetSpend = new Set([
  "bid_amount",
  "daily_budget",
  "daily_min_spend_target",
  "daily_spend_cap",
  "lifetime_budget",
  "lifetime_min_spend_target",
  "lifetime_spend_cap",
]);

const without = (args: Args, keys: Set<string>) =>
  Object.fromEntries(Object.entries(args).filter(([key]) => !keys.has(key)));

// The Meta Ads MCP tools that stage the campaign draft, each with the change
// wovain makes to the agent's arguments. Each tool creates its object paused
// in the ad account's Ads Manager draft (they take no status), so nothing
// here can spend; only ads_activate_entity publishes. Uploads are URL-only,
// since a local upload opens Meta's own widget.
export const draftToolSchema = z.enum([
  "ads_create_ad",
  "ads_create_ad_set",
  "ads_create_campaign",
  "ads_create_creative",
  "ads_creative_upload_media",
]);
type DraftTool = z.infer<typeof draftToolSchema>;

const guards: Record<
  DraftTool,
  (args: Args, dailyBudgetCents: number) => Args
> = {
  ads_create_ad: (args: Args) => args,
  ads_create_ad_set: (args: Args) => without(args, adSetSpend),
  ads_create_campaign: (args: Args, dailyBudgetCents: number) => ({
    ...without(args, campaignSpend),
    campaign_daily_budget: dailyBudgetCents,
  }),
  ads_create_creative: (args: Args) => args,
  ads_creative_upload_media: (args: Args) => ({
    ...args,
    upload_source: "URL",
  }),
};

// The arguments wovain sends for one draft call, with Meta's widgets hidden
// in favor of wovain's.
export const draftArgs = (
  tool: DraftTool,
  args: Args,
  dailyBudgetCents: number
): Args => guards[tool]({ ...args, hide_ui: true }, dailyBudgetCents);
