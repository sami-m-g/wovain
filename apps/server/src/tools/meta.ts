import type { McpServer } from "@modelcontextprotocol/server";
import { launchRequestSchema } from "@wovain/shared/campaign";
import { money } from "@wovain/shared/economics";
import { z } from "zod";

import { draftPlan } from "../lib/campaign-plan.ts";
import {
  ADVERTISER_JOB,
  draftArgs,
  draftToolSchema,
  newConversationId,
} from "../lib/meta-draft.ts";
import {
  CHECKED_FIELDS,
  checkCreatives,
  checkDraft,
  CREATIVE_FIELDS,
} from "../lib/meta-launch.ts";
import { snapshotOf } from "../lib/meta-staged.ts";
import { text } from "../lib/tool-result.ts";
import {
  canReach,
  connectReply,
  unreachable,
  upstreamReply,
} from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

const recordedCampaign = async (store: Store) => {
  const saved = await store.getCampaign();
  if (saved === undefined) {
    throw new Error(
      "No campaign staged yet: build the draft with campaign_draft first."
    );
  }
  return saved;
};

// Stages the draft on the merchant's own Meta grant. Every object is staged
// paused, with only the plan's budget, products and media.
const registerDraftTool = (
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
        "Stage one object of the merchant's campaign in their Meta ad account's draft, on the Meta account they connected to wovain: upload one of the approved ads' images or videos by URL, or create the campaign, the ad set, a creative (single video, single image, multi_media or carousel cards, with only image hashes and video IDs wovain uploaded and only the plan's product links) or an ad. Pass the Meta tool name and only the arguments the campaign playbook lists, with client_conversation_id; anything else is refused. Meta stages every object paused, so nothing spends until the merchant confirms the launch. wovain sets the campaign's daily budget from campaign_plan and records the campaign it creates. Needs at least one approved ad concept.",
      inputSchema: z.object({
        arguments: z.record(z.string(), z.unknown()),
        tool: draftToolSchema,
      }),
      title: "Stage the Meta campaign draft",
    },
    async ({ arguments: args, tool }) => {
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const [plan, staged] = await Promise.all([
        draftPlan(store, await store.getSettings()),
        upstream.staged.get(store.userId),
      ]);
      if (tool !== "ads_create_campaign" && staged?.frozen === true) {
        throw new Error(
          "This campaign's draft is frozen: the merchant was asked to confirm its launch. Start a new campaign to change it."
        );
      }
      const sent = draftArgs(tool, args, { ...plan, staged });
      const reply = await upstreamReply(upstream, {
        args: sent,
        id: "meta",
        tool,
        userId: store.userId,
      });
      // Only a real Meta result is recorded: not an error, a connect link
      // or "not set up".
      const content: unknown =
        "structuredContent" in reply ? reply.structuredContent : undefined;
      if (
        ("isError" in reply && reply.isError) ||
        typeof content !== "object" ||
        content === null ||
        "needsConnection" in content ||
        "configured" in content
      ) {
        return reply;
      }
      const recorded = await upstream.staged.record(
        store.userId,
        tool,
        sent,
        content
      );
      if (recorded === "") {
        throw new Error(
          `Meta staged the ${tool} object but its reply had no ID, so wovain can't use it or launch with it. Delete it in Ads Manager's drafts and try again.`
        );
      }
      if (tool === "ads_create_campaign") {
        await store.saveCampaign({
          adAccountId: String(sent["ad_account_id"]),
          campaignId: recorded,
          rulesCreated: [],
        });
      }
      return reply;
    }
  );
};

// Launching is the merchant's call, made outside the chat: request_launch
// opens wovain's confirm page, where they sign in and press Confirm.
// launch_campaign publishes only with that confirmation, once, and only if
// the draft read back still matches the plan.
const registerLaunchTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  server.registerTool(
    "request_launch",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Make the link where the merchant confirms launching the staged campaign, in their own browser (signed in to wovain). The campaign widget's Launch button opens it. Nothing launches until they press Confirm there.",
      inputSchema: z.object({}),
      outputSchema: launchRequestSchema,
      title: "Ask the merchant to confirm the launch",
    },
    async () => {
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const settings = await store.getSettings();
      const [saved, staged, plan] = await Promise.all([
        recordedCampaign(store),
        upstream.staged.get(store.userId),
        draftPlan(store, settings),
      ]);
      if (staged?.campaignId !== saved.campaignId) {
        throw new Error("wovain has no record of this campaign's draft.");
      }
      // From now on the draft can't change; the merchant approves exactly
      // this record.
      await upstream.staged.freeze(store.userId);
      const frozen = { ...staged, frozen: true };
      const countries = [
        ...new Set(staged.adSets.flatMap((set) => set.countries)),
      ];
      const pages = [...new Set(staged.creatives.map((item) => item.pageId))];
      const confirmUrl = await upstream.confirmLaunchUrl(store.userId, {
        campaignId: saved.campaignId,
        snapshot: snapshotOf(frozen, plan.ads),
        summary: `Campaign ${staged.campaignId}: ${staged.adSets.length} ad ${staged.adSets.length === 1 ? "set" : "sets"} in ${countries.join(", ")}, ${staged.ads.length} ${staged.ads.length === 1 ? "ad" : "ads"} from ${staged.creatives.length} ${staged.creatives.length === 1 ? "creative" : "creatives"} on Page ${pages.join(", ")}. Budget: ${money(plan.dailyBudgetCents / 100)} a day.`,
      });
      return {
        content: text(
          `The merchant confirms the launch at ${confirmUrl} (it works for 10 minutes). Wait until they say they confirmed, then call launch_campaign.`
        ),
        structuredContent: { confirmUrl },
      };
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
        "Publish the staged campaign in Meta, which starts spending, after the merchant confirmed it on wovain's confirm page (request_launch). Without that confirmation it refuses. It publishes only the objects wovain staged, after reading the draft and its creatives back: it stops on any object wovain didn't stage, or any budget, objective, cap, bid, targeting, link, image hash, video, carousel card, call to action or Page that differs from what wovain staged.",
      inputSchema: z.object({}),
      title: "Launch the campaign",
    },
    async () => {
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const [saved, staged] = await Promise.all([
        recordedCampaign(store),
        upstream.staged.get(store.userId),
      ]);
      if (staged?.campaignId !== saved.campaignId) {
        throw new Error("Not launched: wovain has no record of this draft.");
      }
      // The plan now, so a concept changed since the confirmation stops it.
      const plan = await draftPlan(store, await store.getSettings());
      const approved = await upstream.launches.consume(
        store.userId,
        saved.campaignId,
        snapshotOf(staged, plan.ads)
      );
      if (!approved) {
        throw new Error(
          "Not launched: the merchant hasn't confirmed this draft on wovain's confirm page (or it changed since). Call request_launch and show them the link."
        );
      }
      const meta = {
        ad_account_id: staged.adAccountId.replace(/^act_/u, ""),
        advertiser_job: ADVERTISER_JOB,
        client_conversation_id: newConversationId(),
      };
      const read = async (tool: string, args: Record<string, unknown>) =>
        await upstream.call({
          args: { ...meta, ...args },
          id: "meta",
          tool,
          userId: store.userId,
        });
      const [draft, creatives] = await Promise.all([
        read("ads_get_ad_entities", {
          fields: CHECKED_FIELDS,
          object_ids: [staged.campaignId],
          object_state: "draft",
        }),
        read("ads_get_creatives", {
          creative_ids: staged.creatives.map((creative) => creative.id),
          fields: CREATIVE_FIELDS,
        }),
      ]);
      if (draft.kind === "connect") {
        return connectReply(draft.connect);
      }
      if (creatives.kind === "connect") {
        return connectReply(creatives.connect);
      }
      const { objectIds, problems } = checkDraft(
        draft.result.structuredContent,
        staged,
        plan.dailyBudgetCents
      );
      const all = [
        ...problems,
        ...checkCreatives(
          creatives.result.structuredContent,
          staged,
          plan.linkUrls
        ),
      ];
      if (all.length > 0) {
        throw new Error(`Not launched: ${all.join("; ")}.`);
      }
      return await upstreamReply(upstream, {
        args: {
          ...meta,
          entity_id: staged.campaignId,
          entity_type: "campaign",
          hide_ui: true,
          object_ids: objectIds,
          publish_as_active: true,
        },
        id: "meta",
        tool: "ads_activate_entity",
        userId: store.userId,
      });
    }
  );
};

export const registerMetaCampaignTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  registerDraftTool(server, store, upstream);
  registerLaunchTools(server, store, upstream);
};
