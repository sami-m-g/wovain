import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { text } from "../lib/tool-result.ts";
import { ads } from "./ads.ts";
import { autopilot } from "./autopilot.ts";
import { campaign } from "./campaign.ts";
import { design } from "./design.ts";

// The journey's steps, in order, then autopilot, which runs them all. Each
// playbook names the wovain, Fourthwall, Meta Ads and fal calls the agent
// makes, so any MCP client can run the flow.
const playbooks = { ads, autopilot, campaign, design } as const;
const stepSchema = z.enum(["design", "ads", "campaign", "autopilot"]);

// Sent on initialize, so a connecting agent knows the flow before any call.
export const instructions = `wovain takes a print-on-demand merchant from a product idea to a live Fourthwall drop (a set of matching products) and one Meta Advantage+ sales campaign, one approved widget at a time.

wovain reaches the merchant's own fal account through its \`fal\` tool, their Fourthwall shop through its \`fourthwall\` tool and their Meta ad account through its \`meta_ads\` tool, each on the account the merchant connected to wovain. Before anything else, check \`list_connections\`; offer \`connect_account\` (provider fourthwall, fal or meta) for any missing provider, show the merchant its link and wait until they say they're done. When a result has \`needsConnection\`, show the merchant its link, wait until they say they're done, then retry. When the merchant asks how their shop, products or ads are doing, call \`show_dashboard\`. The design step runs entirely through wovain (publishing included, with \`publish_design\` after the merchant approves). Until wovain's Meta app passes Meta's App Review, merchants who can't connect Meta to wovain use the host's Meta Ads MCP server for the campaign.

Steps, each with a playbook (get_playbook, or the MCP prompt of the same name):
${Object.entries(playbooks)
  .map(([step, playbook]) => `- ${step}: ${playbook.description}`)
  .join("\n")}

Read a step's playbook before starting it, and follow it exactly. Nothing is published or spends money without the merchant's approval on a widget, except in autopilot, which the merchant turns on themselves on wovain's confirm page: then products stay hidden and the campaign paused until they confirm the launch.`;

export const registerPlaybooks = (server: McpServer) => {
  server.registerTool(
    "get_playbook",
    {
      annotations: { readOnlyHint: true },
      description:
        "Read the step-by-step playbook for one wovain step (design, ads or campaign), or autopilot, which runs them all. Call before starting that step or acting on its widget.",
      inputSchema: z.object({ step: stepSchema }),
      title: "Get a wovain playbook",
    },
    ({ step }) => ({ content: text(playbooks[step].text) })
  );

  for (const step of stepSchema.options) {
    const playbook = playbooks[step];
    server.registerPrompt(
      step,
      { description: playbook.description, title: `wovain ${step}` },
      () => ({
        messages: [
          { content: { text: playbook.text, type: "text" }, role: "user" },
        ],
      })
    );
  }
};
