import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  blockerSchema,
  campaignResultSchema,
  campaignStatusSchema,
} from "@wovain-foss/shared/campaign";
import type { Campaign } from "@wovain-foss/shared/campaign";
import { breakeven, money } from "@wovain-foss/shared/economics";
import {
  adName,
  metaRules,
  ruleLabels,
  ruleThresholds,
} from "@wovain-foss/shared/rules";
import type { RuleLabel, RuleProduct } from "@wovain-foss/shared/rules";
import type { Settings } from "@wovain-foss/shared/settings";
import { z } from "zod";

import { cardUri } from "../cards.ts";
import type { Env } from "../env.ts";
import { createMetaGraph } from "../lib/meta-graph.ts";
import { text } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";

// Each link carries the ad's ID so Fourthwall sales can be matched to the ad.
const URL_TAGS =
  "utm_source=meta&utm_medium=paid&utm_campaign=wovain&utm_content={{ad.id}}";

// Added ads joined with their design's price, plus the campaign budget and the
// rule inputs derived from them, for the plan, rules and card.
const addedProducts = async (store: Store, settings: Settings) => {
  const all = await store.getAds();
  const ads = all.filter((ad) => ad.status === "added");
  const products = await Promise.all(
    ads.map(async (ad) => {
      const design = await store.requireDesign(ad.designId);
      const math = breakeven(
        design.quote.price,
        design.quote.baseCost,
        settings.economics
      );
      return { ad, breakevenPerSale: math.perSale, design };
    })
  );
  if (products.length === 0) {
    throw new Error(
      "no ad cards were added; add at least one before launching"
    );
  }
  return {
    dailyBudget: settings.campaign.dailyBudgetPerProduct * products.length,
    products,
    ruleProducts: products.map(({ ad, breakevenPerSale }) => ({
      breakevenPerSale,
      designId: ad.designId,
    })),
  };
};

const ruleDetails = (
  products: RuleProduct[],
  rules: Settings["rules"],
  dailyBudget: number
): Record<RuleLabel, string> => {
  const lowest = Math.min(...products.map((p) => p.breakevenPerSale));
  const t = ruleThresholds(lowest, rules);
  const each = products.length > 1 ? " (strictest product)" : "";
  return {
    Alert: `Tell you when a sale costs more than ${money(t.alertAbove)}${each}, daily`,
    "Kill, design":
      products.length === 1
        ? `Pause the product at ${money(t.killDesignAt)} spend with no sales`
        : "Checked when you ask how the campaign is doing",
    "Kill, no sales": `Pause an ad at ${money(t.killNoSalesAt)} spend with no sales${each}`,
    "Kill, too expensive": `Pause an ad above ${money(t.killExpensiveAbove)} a sale after ${rules.killExpensiveMinSales} sales in 7 days${each}`,
    Scale: `Budget +${rules.scaleStepPct}% under ${money(t.scaleUnder)} a sale (${rules.scaleMinSales}+ sales, 3 days), up to ${money(dailyBudget * rules.scaleCapMultiple)} a day`,
  };
};

export const registerCampaignTools = (
  server: McpServer,
  store: Store,
  env: Env
) => {
  server.registerTool(
    "campaign_plan",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Everything the wovain-campaign skill needs to build the Meta campaign: the daily budget in cents, and for each added ad card its product link, copy, static image, finished videos, the ad name for each video (rules find ads by these names) and the URL tags. Call after the last ad card is added or skipped.",
      inputSchema: z.object({}),
      title: "Campaign plan",
    },
    async () => {
      const settings = await store.getSettings();
      const { dailyBudget, products } = await addedProducts(store, settings);
      const plan = {
        campaignName: `wovain · ${new Date().toISOString().slice(0, 10)}`,
        dailyBudgetCents: Math.round(dailyBudget * 100),
        products: products.map(({ ad, design }) => ({
          designId: ad.designId,
          headline: ad.headline,
          primaryText: ad.primaryText,
          productUrl: design.productUrl,
          staticImageUrl: ad.staticImage.url,
          title: ad.productTitle,
          videos: ad.videos.flatMap((video) =>
            video.status === "ready"
              ? [{ adName: adName(ad.designId, video.slot), url: video.url }]
              : []
          ),
        })),
        urlTags: URL_TAGS,
      };
      return { content: text(JSON.stringify(plan)) };
    }
  );

  server.registerTool(
    "create_rules",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Create the five wovain automated rules for the campaign in Meta (the Meta Ads MCP has no rules tool). Safe to call again: rules that already exist are skipped. Needs META_SYSTEM_USER_TOKEN in .env; without it, says so and creates nothing.",
      inputSchema: z.object({
        adAccountId: z.string().regex(/^(?:act_)?\d+$/u),
        campaignId: z.string().regex(/^\d+$/u),
      }),
      title: "Create campaign rules",
    },
    async ({ adAccountId, campaignId }) => {
      const settings = await store.getSettings();
      const { dailyBudget, ruleProducts } = await addedProducts(
        store,
        settings
      );
      const rules = metaRules({
        campaignId,
        dailyBudget,
        products: ruleProducts,
        rules: settings.rules,
      });
      if (env.META_SYSTEM_USER_TOKEN === undefined) {
        await store.saveCampaign({
          adAccountId,
          campaignId,
          rulesCreated: [],
        });
        return {
          content: text(
            "No rules created: add a Meta access token with ads_management to .env as META_SYSTEM_USER_TOKEN, restart the app, then call create_rules again. Show the campaign card as blocked with that fix."
          ),
        };
      }
      const graph = createMetaGraph(env.META_SYSTEM_USER_TOKEN, adAccountId);
      const existing = new Set(await graph.listRuleNames());
      await Promise.all(
        rules.flatMap((rule) =>
          existing.has(rule.name) ? [] : [graph.createRule(rule)]
        )
      );
      const created = [...new Set(rules.map((rule) => rule.label))];
      await store.saveCampaign({
        adAccountId,
        campaignId,
        rulesCreated: created,
      });
      return {
        content: text(`Rules in place: ${created.join(", ")}.`),
      };
    }
  );

  registerAppTool(
    server,
    "show_campaign_card",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Campaign ready",
        "openai/toolInvocation/invoking": "Putting the campaign card together…",
        ui: { resourceUri: cardUri("campaign") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show the campaign card: ready (built in Meta, waiting for the merchant's Launch), live (published), or blocked (with each issue and its fix, such as a missing payment method). wovain adds the products, budget and rules itself.",
      inputSchema: z.object({
        adAccountId: z
          .string()
          .regex(/^(?:act_)?\d+$/u)
          .optional(),
        blockers: z.array(blockerSchema).optional(),
        campaignId: z.string().regex(/^\d+$/u).optional(),
        status: campaignStatusSchema,
      }),
      outputSchema: campaignResultSchema,
      title: "Show campaign card",
    },
    async ({ adAccountId, blockers, campaignId, status }) => {
      const [settings, saved] = await Promise.all([
        store.getSettings(),
        store.getCampaign(),
      ]);
      const { dailyBudget, products, ruleProducts } = await addedProducts(
        store,
        settings
      );
      const details = ruleDetails(ruleProducts, settings.rules, dailyBudget);
      const account = (adAccountId ?? saved?.adAccountId)?.replace(
        /^act_/u,
        ""
      );
      const id = campaignId ?? saved?.campaignId;
      const inMeta = new Set(saved?.rulesCreated);
      const campaign: Campaign = {
        ...(account !== undefined &&
          id !== undefined && {
            adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${id}`,
          }),
        blockers: blockers ?? [],
        ...(id !== undefined && { campaignId: id }),
        dailyBudget,
        products: products.map(({ ad }) => ({
          ads: ad.videos.filter((video) => video.status === "ready").length,
          designId: ad.designId,
          title: ad.productTitle,
        })),
        rules: ruleLabels.map((label) => ({
          created: inMeta.has(label),
          detail: details[label],
          label,
        })),
        status,
      };
      return {
        content: text(
          status === "ready"
            ? "Showing the campaign card. Nothing spends until the merchant presses Launch."
            : `Showing the campaign card (${status}).`
        ),
        structuredContent: { campaign },
      };
    }
  );
};
