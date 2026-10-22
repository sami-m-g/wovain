import type { McpServer } from "@modelcontextprotocol/server";
import { launchApprovalSchema } from "@wovain/shared/campaign";
import { z } from "zod";

import { addedProducts } from "../lib/campaign-plan.ts";
import {
  ADVERTISER_JOB,
  draftArgs,
  draftObjectIds,
  draftToolSchema,
  newConversationId,
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

// Tools only the widget may call (MCP Apps visibility): hidden from the model.
const APP_ONLY = { ui: { visibility: ["app"] } };

// Builds the draft and launches it on the merchant's own Meta grant. Every
// object is staged paused; only launch_campaign publishes.
export const registerMetaCampaignTools = (
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

  // Only the campaign widget calls these two (app-only visibility): the
  // merchant's press of Launch mints a single-use launch ticket for the
  // recorded campaign, and launch_campaign spends only with one. The agent
  // never launches.
  server.registerTool(
    "approve_launch",
    {
      _meta: APP_ONLY,
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Called by the campaign widget when the merchant presses Launch: returns a single-use launch ticket for the recorded campaign, valid for 2 minutes.",
      inputSchema: z.object({ campaignId: z.string().regex(/^\d+$/u) }),
      outputSchema: launchApprovalSchema,
      title: "Approve the launch",
    },
    async ({ campaignId }) => {
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const saved = await store.getCampaign();
      if (saved?.campaignId !== campaignId) {
        throw new Error("That isn't the recorded campaign.");
      }
      const launchToken = await upstream.approveLaunch(
        store.userId,
        campaignId
      );
      return {
        content: text("Launch approved by the merchant."),
        structuredContent: { launchToken },
      };
    }
  );

  server.registerTool(
    "launch_campaign",
    {
      _meta: APP_ONLY,
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Called by the campaign widget after approve_launch: publishes the recorded campaign and its draft ad sets and ads in Meta, which starts spending. Needs the launch ticket; objectIds, if given, must belong to that campaign's draft.",
      inputSchema: z.object({
        launchToken: z.string().min(1).max(100),
        objectIds: z.array(z.string().regex(/^\d+$/u)).max(200).default([]),
      }),
      title: "Launch the campaign",
    },
    async ({ launchToken, objectIds }) => {
      const saved = await store.getCampaign();
      if (!canReach(upstream, "meta")) {
        return unreachable(upstream, "meta");
      }
      const approved =
        saved !== undefined &&
        (await upstream.redeemLaunch(
          launchToken,
          store.userId,
          saved.campaignId
        ));
      if (!approved) {
        throw new Error(
          "Not launched: only the merchant's press of Launch on the campaign widget can launch, once."
        );
      }
      const meta = {
        ad_account_id: saved.adAccountId.replace(/^act_/u, ""),
        advertiser_job: ADVERTISER_JOB,
        client_conversation_id: newConversationId(),
      };
      const draft = await upstream.call({
        args: {
          ...meta,
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
      const inDraft = new Set(draftObjectIds(draft.result.structuredContent));
      const foreign = objectIds.filter((objectId) => !inDraft.has(objectId));
      if (foreign.length > 0) {
        throw new Error(
          `Not launched: ${foreign.join(", ")} isn't part of the recorded campaign's draft.`
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
              ...(objectIds.length > 0 ? objectIds : inDraft),
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
