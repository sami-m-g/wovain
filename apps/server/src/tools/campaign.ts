import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  blockerSchema,
  campaignResultSchema,
  campaignStatusSchema,
} from "@wovain/shared/campaign";
import type { Campaign } from "@wovain/shared/campaign";
import { money } from "@wovain/shared/economics";
import {
  adName,
  activeRuleLabels,
  metaRules,
  ruleThresholds,
} from "@wovain/shared/rules";
import type { MetaRule, RuleLabel, RuleProduct } from "@wovain/shared/rules";
import type { Settings } from "@wovain/shared/settings";
import { z } from "zod";

import { addedProducts, URL_TAGS } from "../lib/campaign-plan.ts";
import { createMetaGraph } from "../lib/meta-graph.ts";
import { text, userSafe } from "../lib/tool-result.ts";
import { canReach, connectReply, unreachable } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

// An ad account ID without Meta's "act_" prefix.
const bareAccount = (id: string) => id.replace(/^act_/u, "");

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

interface MetaDeps {
  // wovain's Meta app secret, for appsecret_proof on Graph calls.
  metaAppSecret?: string | undefined;
  upstream?: Upstream | undefined;
}

// Creates the rules that don't exist yet with the merchant's own token, so
// Graph only lets them touch ad accounts they manage.
const createMissingRules = async (
  token: string,
  adAccountId: string,
  rules: MetaRule[],
  appSecret: string | undefined
) => {
  const graph = createMetaGraph(token, adAccountId, appSecret);
  const existing = new Set(await graph.listRuleNames());
  await Promise.all(
    rules.flatMap((rule) =>
      existing.has(rule.name) ? [] : [graph.createRule(rule)]
    )
  );
};

export const registerCampaignTools = (
  server: McpServer,
  store: Store,
  { metaAppSecret, upstream }: MetaDeps
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
        "Everything the campaign playbook needs to build the Meta campaign: the daily budget in cents, and for each added ad widget its product link, copy, static image, finished videos, the ad name for each video (rules find ads by these names) and the URL tags (unless the merchant turned them off). Call after the last ad widget is added or skipped.",
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
        ...(settings.rules.tagUtmContent && { urlTags: URL_TAGS }),
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
        "Create the five wovain automated rules in Meta (the Meta Ads MCP has no rules tool) for the campaign wovain staged with campaign_draft, with the merchant's own Meta account connected to wovain. Safe to call again: rules that already exist are skipped. Without a Meta connection, the result has needsConnection and a link to show the merchant.",
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
      // Only the campaign wovain staged through campaign_draft, in its own ad
      // account, gets rules.
      const saved = await store.getCampaign();
      if (
        saved?.campaignId !== campaignId ||
        bareAccount(saved.adAccountId) !== bareAccount(adAccountId)
      ) {
        throw new Error(
          "Rules go only on the campaign wovain staged with campaign_draft (its campaign and ad account IDs)."
        );
      }
      const record = async (created: string[]) => {
        await store.saveCampaign({ ...saved, rulesCreated: created });
      };
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const token = await userSafe(
        "meta token failed:",
        "Couldn't reach the merchant's Meta account. Try again in a minute.",
        async () => await upstream.accessToken(store.userId, "meta")
      );
      if (token.kind === "connect") {
        return connectReply(token.connect);
      }
      await createMissingRules(
        token.accessToken,
        adAccountId,
        rules,
        metaAppSecret
      );
      const created = [...new Set(rules.map((rule) => rule.label))];
      await record(created);
      return {
        content: text(`Rules in place: ${created.join(", ")}.`),
      };
    }
  );

  registerAppTool(
    server,
    "show_campaign_widget",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Campaign ready",
        "openai/toolInvocation/invoking":
          "Putting the campaign widget together…",
        ui: { resourceUri: widgetUri("campaign") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show the campaign widget: ready (built in Meta, waiting for the merchant's Launch), live (published), or blocked (with each issue and its fix, such as a missing payment method). wovain adds the products, budget and rules itself.",
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
      title: "Show campaign widget",
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
      const launchVia =
        canReach(upstream, "meta") &&
        (await upstream.connected(store.userId, "meta"))
          ? "wovain"
          : "chat";
      const campaign: Campaign = {
        ...(account !== undefined &&
          id !== undefined && {
            adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${id}`,
          }),
        blockers: blockers ?? [],
        ...(id !== undefined && { campaignId: id }),
        dailyBudget,
        launchVia,
        products: products.map(({ ad }) => ({
          ads: ad.videos.filter((video) => video.status === "ready").length,
          designId: ad.designId,
          title: ad.productTitle,
        })),
        rules: activeRuleLabels(settings.rules).map((label) => ({
          created: inMeta.has(label),
          detail: details[label],
          label,
        })),
        status,
      };
      return {
        content: text(
          status === "ready"
            ? "Showing the campaign widget. Nothing spends until the merchant presses Launch."
            : `Showing the campaign widget (${status}).`
        ),
        structuredContent: { campaign },
      };
    }
  );
};
