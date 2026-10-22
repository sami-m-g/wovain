import type { McpServer } from "@modelcontextprotocol/server";
import { launchRequestSchema } from "@wovain/shared/campaign";
import { money } from "@wovain/shared/economics";
import { z } from "zod";

import { addedProducts, draftPlan } from "../lib/campaign-plan.ts";
import {
  ADVERTISER_JOB,
  CHECKED_FIELDS,
  checkDraft,
  draftArgs,
  draftToolSchema,
  newConversationId,
  stagedCampaignId,
} from "../lib/meta-draft.ts";
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
        "Stage one object of the merchant's campaign in their Meta ad account's draft, on the Meta account they connected to wovain: upload one of the added ads' videos or images by URL, or create the campaign, the ad set, a creative or an ad. Pass the Meta tool name and only the arguments the campaign playbook lists, with client_conversation_id; anything else is refused. Meta stages every object paused, so nothing spends until the merchant confirms the launch. wovain sets the campaign's daily budget from campaign_plan and records the campaign it creates. Needs at least one added ad widget.",
      inputSchema: z.object({
        arguments: z.record(z.string(), z.unknown()),
        tool: draftToolSchema,
      }),
      title: "Stage the Meta campaign draft",
    },
    async ({ arguments: args, tool }) => {
      const plan = await draftPlan(store, await store.getSettings());
      const sent = draftArgs(tool, args, plan);
      const reply = await upstreamReply(upstream, {
        args: sent,
        id: "meta",
        tool,
        userId: store.userId,
      });
      const failed = "isError" in reply && reply.isError;
      const campaignId =
        tool === "ads_create_campaign" && !failed
          ? stagedCampaignId(reply.structuredContent)
          : undefined;
      if (campaignId !== undefined) {
        await store.saveCampaign({
          adAccountId: String(sent["ad_account_id"]),
          campaignId,
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
      const [saved, { dailyBudget, products }] = await Promise.all([
        recordedCampaign(store),
        addedProducts(store, settings),
      ]);
      const confirmUrl = await upstream.confirmLaunchUrl(
        store.userId,
        saved.campaignId,
        `One Advantage+ sales campaign (${saved.campaignId}) with ${products.length} ${products.length === 1 ? "product" : "products"}: ${products.map(({ ad }) => ad.productTitle).join(", ")}. Budget: ${money(dailyBudget)} a day.`
      );
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
        "Publish the staged campaign in Meta, which starts spending, after the merchant confirmed it on wovain's confirm page (request_launch). Without that confirmation it refuses. It reads the draft back and stops if the budget, objective or caps differ from the plan. objectIds, if given, must belong to the campaign's draft.",
      inputSchema: z.object({
        objectIds: z.array(z.string().regex(/^\d+$/u)).max(200).default([]),
      }),
      title: "Launch the campaign",
    },
    async ({ objectIds }) => {
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const saved = await recordedCampaign(store);
      if (!(await upstream.launches.consume(store.userId, saved.campaignId))) {
        throw new Error(
          "Not launched: the merchant hasn't confirmed this launch on wovain's confirm page. Call request_launch and show them the link."
        );
      }
      const plan = await draftPlan(store, await store.getSettings());
      const meta = {
        ad_account_id: saved.adAccountId.replace(/^act_/u, ""),
        advertiser_job: ADVERTISER_JOB,
        client_conversation_id: newConversationId(),
      };
      const draft = await upstream.call({
        args: {
          ...meta,
          fields: CHECKED_FIELDS,
          object_ids: [saved.campaignId],
          object_state: "draft",
        },
        id: "meta",
        tool: "ads_get_ad_entities",
        userId: store.userId,
      });
      if (draft.kind === "connect") {
        return connectReply(draft.connect);
      }
      const { ids, problems } = checkDraft(
        draft.result.structuredContent,
        saved.campaignId,
        plan.dailyBudgetCents
      );
      const inDraft = new Set(ids);
      const foreign = objectIds.filter((objectId) => !inDraft.has(objectId));
      if (problems.length > 0 || foreign.length > 0) {
        throw new Error(
          `Not launched: ${[...problems, ...foreign.map((objectId) => `${objectId} isn't in the campaign's draft`)].join("; ")}.`
        );
      }
      return await upstreamReply(upstream, {
        args: {
          ...meta,
          entity_id: saved.campaignId,
          entity_type: "campaign",
          hide_ui: true,
          object_ids: [
            ...new Set([
              saved.campaignId,
              ...(objectIds.length > 0 ? objectIds : ids),
            ]),
          ],
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
