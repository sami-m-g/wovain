import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { providers, providerSchema } from "../lib/connections.ts";
import type { ProviderId } from "../lib/connections.ts";
import { text } from "../lib/tool-result.ts";
import {
  canReach,
  LINK_NOTE,
  UNTRUSTED,
  unreachable,
  upstreamReply,
} from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

// Read-only or reversible upstream tools the playbooks use. Publishing,
// pricing, orders, paid generation and every Meta write are left out on
// purpose: wovain runs those itself, behind the merchant's approval.
const allowlists = {
  fal: [
    "check_account_status",
    "check_job",
    "estimate_cost",
    "get_job_result",
    "get_model_schema",
    "get_pricing",
    "search_models",
    "search_request_history",
    "wait_for_jobs",
  ],
  fourthwall: [
    "ecommerce_generate-product-design-previews",
    "ecommerce_get-catalog-product-details",
    "ecommerce_get-catalog-products",
    "ecommerce_get-current-shop",
    "ecommerce_get-customization-pricing",
    "ecommerce_request-media-upload-link",
    "ecommerce_save-media-library-image",
    "get-instructions",
    "load-skills",
    "omni_knowledge",
    "omni_search",
    "read-skills",
  ],
  meta: [
    "ads_account_get_activity_logs",
    "ads_get_ad_account_pages",
    "ads_get_ad_accounts",
    "ads_get_ad_entities",
    "ads_get_ad_images",
    "ads_get_ad_preview",
    "ads_get_ad_videos",
    "ads_get_creatives",
    "ads_get_dataset_details",
    "ads_get_datasets",
    "ads_get_errors",
    "ads_get_field_context",
    "ads_get_help_article",
    "ads_get_opportunity_score",
    "ads_get_pages_for_business",
    "ads_get_user_pages",
    "ads_insights_advertiser_context",
    "ads_insights_anomaly_signal",
    "ads_insights_performance_trend",
  ],
} as const;

const needsLink = (title: string) =>
  `If the merchant hasn't connected ${title}, the result has needsConnection and a link to show them.`;

const tools: Record<
  ProviderId,
  { description: string; name: string; title: string }
> = {
  fal: {
    description: `Call a tool on the merchant's own fal account, which they connected to wovain. Pass the fal tool name and its arguments as fal documents them. Only read-only tools are allowed: generation runs through wovain's generate_videos and add_video_audio. ${UNTRUSTED} ${needsLink("fal")}`,
    name: "fal",
    title: "fal (merchant's account)",
  },
  fourthwall: {
    description: `Call a tool on the merchant's own Fourthwall shop, which they connected to wovain. Pass the Fourthwall tool name and its arguments as Fourthwall documents them; call get-instructions, then ecommerce_get-current-shop, then load-skills before anything else. Publishing and pricing tools aren't allowed here. ${UNTRUSTED} ${needsLink("Fourthwall")}`,
    name: "fourthwall",
    title: "Fourthwall (merchant's shop)",
  },
  meta: {
    description: `Read the merchant's own Meta ad accounts, Pages, pixels, drafts and results through Meta's Ads MCP, on the Meta account they connected to wovain. Pass the Meta tool name and its arguments as Meta documents them, always with advertiser_job and client_conversation_id. Only read-only and reporting tools are allowed: the campaign draft goes through campaign_draft and publishing through launch_campaign. ${UNTRUSTED} ${needsLink("Meta")} Until wovain's Meta app passes App Review, only people with a role on the app can connect; for anyone else, use the host's own Meta Ads connector if it has one.`,
    name: "meta_ads",
    title: "Meta Ads (merchant's account)",
  },
};

// One proxy tool per provider over the merchant's own grant, and a way to
// forget a grant.
export const registerConnectionTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  for (const id of providerSchema.options) {
    const { description, name, title } = tools[id];
    server.registerTool(
      name,
      {
        annotations: {
          destructiveHint: false,
          openWorldHint: true,
          readOnlyHint: false,
        },
        description,
        inputSchema: z.object({
          arguments: z.record(z.string(), z.unknown()).default({}),
          tool: z.enum(allowlists[id]),
        }),
        title,
      },
      async ({ arguments: args, tool }) =>
        await upstreamReply(upstream, {
          args,
          id,
          tool,
          userId: store.userId,
        })
    );
  }

  server.registerTool(
    "list_connections",
    {
      annotations: { readOnlyHint: true },
      description:
        "Show which of the merchant's accounts (fourthwall, fal, meta) are connected to wovain. Call this before anything else; for any provider that isn't connected, offer connect_account.",
      title: "List connected accounts",
    },
    async () => {
      const rows = await Promise.all(
        providerSchema.options.map(async (id) => ({
          available: canReach(upstream, id),
          connected: canReach(upstream, id)
            ? await upstream.connected(store.userId, id)
            : false,
          provider: id,
        }))
      );
      return {
        content: text(
          rows
            .map(({ available, connected, provider }) => {
              const { title } = providers[provider];
              if (connected) {
                return `${provider}: ${title} is connected.`;
              }
              return available
                ? `${provider}: ${title} isn't connected. Offer connect_account.`
                : `${provider}: ${title} can't be connected on this server yet.`;
            })
            .join("\n")
        ),
        structuredContent: { connections: rows },
      };
    }
  );

  server.registerTool(
    "connect_account",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Get the link where the merchant connects their own Fourthwall shop, fal account or Meta ad account (fourthwall, fal or meta) to wovain. Use it when list_connections shows a provider isn't connected, or the merchant asks to connect or reconnect one. Show them the link, wait until they say they're done, then continue. The link is personal: single use, valid 5 minutes, and it asks them to sign in to wovain.",
      inputSchema: z.object({ provider: providerSchema }),
      title: "Connect an account",
    },
    async ({ provider }) => {
      if (!canReach(upstream, provider)) {
        return unreachable(upstream, provider);
      }
      const { title } = providers[provider];
      const connectUrl = await upstream.connectUrl(store.userId, provider);
      const already = await upstream.connected(store.userId, provider);
      return {
        content: text(
          `${already ? `The merchant's ${title} account is already connected; this link replaces that connection. ` : ""}Show the merchant this link to connect their ${title} account: ${connectUrl}\n${LINK_NOTE}`
        ),
        structuredContent: { connectUrl, provider },
      };
    }
  );

  server.registerTool(
    "disconnect",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Delete wovain's stored access to one of the merchant's accounts (fourthwall, fal or meta). Only when the merchant asks. To also remove wovain on the provider's side, they revoke it there (for Meta: Facebook Settings, Business Integrations).",
      inputSchema: z.object({ provider: providerSchema }),
      title: "Disconnect an account",
    },
    async ({ provider }) => {
      if (!canReach(upstream, provider)) {
        return unreachable(upstream, provider);
      }
      const removed = await upstream.disconnect(store.userId, provider);
      const { title } = providers[provider];
      return {
        content: text(
          removed
            ? `wovain no longer has access to the merchant's ${title} account.`
            : `The merchant's ${title} account wasn't connected to wovain.`
        ),
      };
    }
  );
};
