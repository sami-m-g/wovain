import type { McpServer } from "@modelcontextprotocol/server";
import { lowPrints } from "@wovain/shared/design";
import { z } from "zod";

import {
  find,
  fourthwallCaller,
  publishDesign,
  PublishRefusedError,
  shopSchema,
} from "../lib/publish-design.ts";
import { logErrorClass, notConfigured, text } from "../lib/tool-result.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

// Publishing an approved design on the merchant's own Fourthwall shop. The
// proxy `fourthwall` tool can't publish; this tool can, and only after the
// merchant pressed Approve on the widget.
export const registerPublishTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  server.registerTool(
    "publish_design",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Publish a design the merchant approved on its widget (after 'Approve design dN' and the trademark screen): creates every product of the drop on the merchant's Fourthwall shop from its customization, sets each product's price from the widget, makes them public and groups a drop into one collection. The widget follows along: it shows Live with a link, or Fourthwall's reason. Refuses a design the merchant hasn't approved. A retry reuses products already created. If the merchant hasn't connected Fourthwall, the result has needsConnection and a link to show them.",
      inputSchema: z.object({ id: z.string() }),
      title: "Publish an approved design",
    },
    async ({ id }) => {
      const design = await store.requireDesign(id);
      if (design.status !== "publishing") {
        throw new Error(
          `Design ${id} is ${design.status}: only a design the merchant approved on its widget can be published.`
        );
      }
      if (lowPrints(design).length > 0) {
        throw new Error(
          `Design ${id} has a print that would come out blurry; fix the art before publishing.`
        );
      }
      if (upstream === undefined) {
        return notConfigured(
          "Connections aren't set up on this wovain server (WOVAIN_KMS_KEY)."
        );
      }
      // The shop call first: it gives the shop's address, or the link to
      // connect Fourthwall, before anything is created.
      const shop = await upstreamReply(upstream, {
        args: {},
        id: "fourthwall",
        tool: "ecommerce_get-current-shop",
        userId: store.userId,
      });
      if (
        typeof shop.structuredContent === "object" &&
        shop.structuredContent !== null &&
        "needsConnection" in shop.structuredContent
      ) {
        return shop;
      }
      const call = fourthwallCaller(upstream, store.userId);
      try {
        const [found] = find(
          shopSchema,
          await call("ecommerce_get-current-shop", {})
        );
        const patch = await publishDesign(design, {
          call,
          save: async (progress) => await store.updateDesign(id, progress),
          shopUrl: found?.baseUrl,
        });
        const live = await store.updateDesign(id, { ...patch, status: "live" });
        return {
          content: text(
            `Design ${id} is live: ${1 + live.range.length} product(s) on Fourthwall${live.productUrl === undefined ? "" : ` at ${live.productUrl}`}.`
          ),
          structuredContent: { design: live },
        };
      } catch (error) {
        logErrorClass("publish_design failed:", error);
        const reason =
          error instanceof PublishRefusedError
            ? error.message
            : "Couldn't reach Fourthwall. Try again in a minute.";
        const current = await store.requireDesign(id);
        const rejected = await store.updateDesign(id, {
          rejectCount: current.rejectCount + 1,
          rejectReason: reason,
          status: "rejected",
        });
        return {
          content: text(`Design ${id} wasn't published: ${reason}`),
          isError: true,
          structuredContent: { design: rejected },
        };
      }
    }
  );
};
