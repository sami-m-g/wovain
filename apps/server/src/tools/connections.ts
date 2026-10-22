import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { providerSchema } from "../lib/connections.ts";
import type { ProviderId } from "../lib/connections.ts";
import { UNTRUSTED, upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

// Read-only or reversible upstream tools the playbooks use. Publishing,
// pricing, orders and paid generation are left out on purpose: wovain runs
// those itself, behind the merchant's approval.
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
} as const;

const descriptions: Record<ProviderId, string> = {
  fal: `Call a tool on the merchant's own fal account, which they connected to wovain. Pass the fal tool name and its arguments as fal documents them. Only read-only tools are allowed: generation runs through wovain's generate_videos and add_video_audio. ${UNTRUSTED} If the merchant hasn't connected fal, the result has needsConnection and a link to show them.`,
  fourthwall: `Call a tool on the merchant's own Fourthwall shop, which they connected to wovain. Pass the Fourthwall tool name and its arguments as Fourthwall documents them; call get-instructions, then ecommerce_get-current-shop, then load-skills before anything else. Publishing and pricing tools aren't allowed here. ${UNTRUSTED} If the merchant hasn't connected Fourthwall, the result has needsConnection and a link to show them.`,
};

const titles: Record<ProviderId, string> = {
  fal: "fal (merchant's account)",
  fourthwall: "Fourthwall (merchant's shop)",
};

// One proxy tool per provider over the merchant's own grant.
export const registerConnectionTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  for (const id of providerSchema.options) {
    server.registerTool(
      id,
      {
        annotations: {
          destructiveHint: false,
          openWorldHint: true,
          readOnlyHint: false,
        },
        description: descriptions[id],
        inputSchema: z.object({
          arguments: z.record(z.string(), z.unknown()).default({}),
          tool: z.enum(allowlists[id]),
        }),
        title: titles[id],
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
};
