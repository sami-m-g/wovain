import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { text } from "../lib/tool-result.ts";
import { ads } from "./ads.ts";
import { campaign } from "./campaign.ts";
import { design } from "./design.ts";

// The journey's steps, in order. Each playbook names the wovain, Fourthwall,
// Meta Ads and fal calls the agent makes, so any MCP client can run the flow.
const playbooks = { ads, campaign, design } as const;
const stepSchema = z.enum(["design", "ads", "campaign"]);

// Sent on initialize, so a connecting agent knows the flow before any call.
export const instructions = `wovain takes a print-on-demand merchant from a product idea to a live Fourthwall product and one Meta Advantage+ sales campaign, one approved card at a time. The agent also needs the Fourthwall, Meta Ads and fal MCP servers connected.

Steps, each with a playbook (get_playbook, or the MCP prompt of the same name):
${Object.entries(playbooks)
  .map(([step, playbook]) => `- ${step}: ${playbook.description}`)
  .join("\n")}

Read a step's playbook before starting it, and follow it exactly. Nothing is published or spends money without the merchant's approval on a card.`;

export const registerPlaybooks = (server: McpServer) => {
  server.registerTool(
    "get_playbook",
    {
      annotations: { readOnlyHint: true },
      description:
        "Read the step-by-step playbook for one wovain step (design, ads or campaign). Call before starting that step or acting on its card.",
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
