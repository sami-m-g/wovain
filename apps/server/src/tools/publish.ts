import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  claimPublish,
  designHash,
  notApprovable,
  rejectDesign,
  releaseClaim,
} from "../lib/approval.ts";
import type { BrowserConfirm } from "../lib/browser-confirm.ts";
import {
  fourthwallCaller,
  publishDesign,
  PublishRefusedError,
} from "../lib/publish-design.ts";
import { logErrorClass, notConfigured, text } from "../lib/tool-result.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

const UNREACHABLE = "Couldn't finish publishing on Fourthwall. Try again.";

// Approving and publishing a design on the merchant's own Fourthwall shop.
// No tool approves: the widget's Approve opens a link where the merchant
// signs in to wovain in the browser and confirms (routes/confirm.ts). The
// model can publish only what was confirmed, exactly as it was confirmed.
export const registerPublishTools = (
  server: McpServer,
  store: Store,
  {
    confirm,
    upstream,
  }: { confirm?: BrowserConfirm | undefined; upstream?: Upstream | undefined }
) => {
  registerAppTool(
    server,
    "approval_link",
    {
      _meta: { ui: { resourceUri: widgetUri("design"), visibility: ["app"] } },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "A link for the merchant to confirm a design in their browser, for the design widget's Approve. The link works once, for 5 minutes, and only after the merchant signs in to wovain.",
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.object({ confirmUrl: z.url() }),
      title: "Approval link",
    },
    async ({ id }) => {
      if (confirm === undefined) {
        throw new Error("Approvals aren't set up on this wovain server.");
      }
      const design = await store.requireDesign(id);
      const refused = notApprovable(design);
      if (refused !== undefined) {
        throw new Error(refused);
      }
      const confirmUrl = await confirm.link(store.userId, {
        hash: designHash(design),
        id,
        kind: "design",
      });
      return {
        content: text("Opened the approval page in the merchant's browser."),
        structuredContent: { confirmUrl },
      };
    }
  );

  const fail = async (id: string, error: unknown) => {
    const refused = error instanceof PublishRefusedError;
    if (!refused) {
      logErrorClass("publish_design failed:", error);
    }
    const reason = refused ? error.message : UNREACHABLE;
    const design = await rejectDesign(store, id, { counted: refused, reason });
    return {
      content: text(`Design ${id} wasn't published: ${reason}`),
      isError: true,
      structuredContent: { design },
    };
  };

  server.registerTool(
    "publish_design",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Publish a design the merchant approved on its widget (after 'Approve design dN' and the trademark screen): creates every product of the drop on the merchant's Fourthwall shop from its customization, sets each product's price from the widget, makes them public and groups a drop into one collection. The widget follows along: it shows Live with a link, or Fourthwall's reason. Refuses a design that wasn't approved as it is now, or one already being published. A retry reuses products already created. If Fourthwall needs connecting, the result has needsConnection and a link to show the merchant; the approval stays for the retry.",
      inputSchema: z.object({ id: z.string() }),
      title: "Publish an approved design",
    },
    async ({ id }) => {
      if (upstream === undefined) {
        return notConfigured(
          "Connections aren't set up on this wovain server (WOVAIN_KMS_KEY)."
        );
      }
      const design = await claimPublish(store, id);
      let patch;
      try {
        patch = await publishDesign(design, {
          call: fourthwallCaller(upstream, store.userId),
          save: async (progress) => await store.updateDesign(id, progress),
        });
      } catch (error) {
        if (error instanceof PublishRefusedError && error.connect) {
          await releaseClaim(store, id);
          const { connectUrl, needsConnection, reconnect } = error.connect;
          return {
            content: text(
              `wovain's access to the merchant's Fourthwall needs connecting. Show the merchant this link: ${connectUrl}\nIt works once, for 5 minutes. Then wait until they say it's done and call publish_design again.`
            ),
            structuredContent: { connectUrl, needsConnection, reconnect },
          };
        }
        return await fail(id, error);
      }
      const live = await store.updateDesign(id, { ...patch, status: "live" });
      return {
        content: text(
          `Design ${id} is live: ${1 + live.range.length} product(s) on Fourthwall${live.productUrl === undefined ? "" : ` at ${live.productUrl}`}.`
        ),
        structuredContent: { design: live },
      };
    }
  );
};
