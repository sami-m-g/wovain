import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  blockerSchema,
  campaignResultSchema,
  campaignStatusSchema,
} from "@wovain/shared/campaign";
import type { Campaign } from "@wovain/shared/campaign";
import { breakeven, money } from "@wovain/shared/economics";
import {
  adName,
  activeRuleLabels,
  metaRules,
  ruleThresholds,
} from "@wovain/shared/rules";
import type { MetaRule, RuleLabel, RuleProduct } from "@wovain/shared/rules";
import type { Settings } from "@wovain/shared/settings";
import { z } from "zod";

import { draftArgs, draftToolSchema } from "../lib/meta-draft.ts";
import { createMetaGraph } from "../lib/meta-graph.ts";
import { text, userSafe } from "../lib/tool-result.ts";
import {
  canReach,
  connectReply,
  unreachable,
  upstreamReply,
} from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

// Each link carries the ad's ID so Fourthwall sales can be matched to the ad.
const URL_TAGS =
  "utm_source=meta&utm_medium=paid&utm_campaign=wovain&utm_content={{ad.id}}";

// Added ads joined with their design's price, plus the campaign budget and the
// rule inputs derived from them, for the plan, rules and widget.
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
      "no ad widgets were added; add at least one before launching"
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

interface MetaDeps {
  // wovain's Meta app secret, for appsecret_proof on Graph calls.
  metaAppSecret?: string | undefined;
  upstream?: Upstream | undefined;
}

// Meta Ads calls wovain makes for the campaign playbook. The agent passes
// client_conversation_id; advertiser_job is always the launch job.
const ADVERTISER_JOB = "create_and_launch_new_ads";
const conversationSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{20}$/u)
  .describe("The client_conversation_id of this chat's Meta Ads calls.");

// Builds the draft and launches it on the merchant's own Meta grant. Every
// object is staged paused; only launch_campaign publishes.
const registerMetaCampaignTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  server.registerTool(
    "campaign_draft",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Stage one object of the merchant's campaign in their Meta ad account's draft, on the Meta account they connected to wovain: upload a video or image by URL, or create the campaign, the ad set, a creative or an ad. Pass the Meta tool name and its arguments as Meta documents them, with advertiser_job and client_conversation_id. Meta stages every object paused, so nothing spends until launch_campaign. wovain sets the campaign's daily budget from campaign_plan and leaves budgets off the ad set. Needs at least one added ad widget.",
      inputSchema: z.object({
        arguments: z.record(z.string(), z.unknown()),
        tool: draftToolSchema,
      }),
      title: "Stage the Meta campaign draft",
    },
    async ({ arguments: args, tool }) => {
      const settings = await store.getSettings();
      const { dailyBudget } = await addedProducts(store, settings);
      return await upstreamReply(upstream, {
        args: draftArgs(tool, args, Math.round(dailyBudget * 100)),
        id: "meta",
        tool,
        userId: store.userId,
      });
    }
  );

  server.registerTool(
    "launch_campaign",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        'Publish the wovain campaign in Meta, which starts spending. Call only when the merchant pressed Launch on the campaign widget (the chat says "Launch the wovain campaign"), never on your own. Publishes the campaign create_rules recorded, with its ad set and ads, on the merchant\'s connected Meta account.',
      inputSchema: z.object({
        clientConversationId: conversationSchema,
        objectIds: z
          .array(z.string().regex(/^\d+$/u))
          .max(200)
          .default([])
          .describe(
            "The draft's ad set and ad IDs (ad_object_id from ads_get_ad_entities with object_state draft and the campaign ID). The campaign itself is added."
          ),
      }),
      title: "Launch the campaign",
    },
    async ({ clientConversationId, objectIds }) => {
      const saved = await store.getCampaign();
      if (saved === undefined) {
        throw new Error(
          "No campaign recorded yet: build the draft and call create_rules first."
        );
      }
      return await upstreamReply(upstream, {
        args: {
          ad_account_id: saved.adAccountId.replace(/^act_/u, ""),
          advertiser_job: ADVERTISER_JOB,
          client_conversation_id: clientConversationId,
          entity_id: saved.campaignId,
          entity_type: "campaign",
          hide_ui: true,
          object_ids: [...new Set([saved.campaignId, ...objectIds])],
          publish_as_active: true,
        },
        id: "meta",
        tool: "ads_activate_entity",
        userId: store.userId,
      });
    }
  );
};

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
  registerMetaCampaignTools(server, store, upstream);

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
        "Create the five wovain automated rules for the campaign in Meta (the Meta Ads MCP has no rules tool), with the merchant's own Meta account connected to wovain, and record the campaign for launch_campaign. Safe to call again: rules that already exist are skipped. Without a Meta connection, the result has needsConnection and a link to show the merchant.",
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
      const record = async (created: string[]) => {
        await store.saveCampaign({
          adAccountId,
          campaignId,
          rulesCreated: created,
        });
      };
      if (!canReach(upstream, "meta")) {
        await record([]);
        return unreachable(upstream, "meta");
      }
      const token = await userSafe(
        "meta token failed:",
        "Couldn't reach the merchant's Meta account. Try again in a minute.",
        async () => await upstream.accessToken(store.userId, "meta")
      );
      if (token.kind === "connect") {
        await record([]);
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
