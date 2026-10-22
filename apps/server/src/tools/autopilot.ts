import type { McpServer } from "@modelcontextprotocol/server";
import {
  AUTOPILOT_TERMS,
  autopilotStartSchema,
  decisionPointSchema,
  runIdSchema,
} from "@wovain/shared/autopilot";
import { z } from "zod";

import { decideAds, decideIdea } from "../lib/autopilot-choose.ts";
import { decideDesign } from "../lib/autopilot-decide.ts";
import type { AutopilotDeps } from "../lib/autopilot-decide.ts";
import {
  AutopilotRefusedError,
  startRun,
  stopRun,
  turnOff,
} from "../lib/autopilot.ts";
import type { BrowserConfirm } from "../lib/browser-confirm.ts";
import { logErrorClass, notConfigured, text } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";

export interface Autopilot {
  // Nemotron, the judge and research; undefined without their keys.
  deps: AutopilotDeps | undefined;
  // The operator's switch (WOVAIN_AUTOPILOT).
  on: boolean;
}

const designIdSchema = z.string().regex(/^d\d+$/u);

const reply = (structured: Record<string, unknown>, message: string) => ({
  content: text(message),
  structuredContent: structured,
});

// A refusal is the agent's next step; anything else is logged by class.
const refusalOrThrow = (label: string, error: unknown) => {
  if (error instanceof AutopilotRefusedError) {
    return {
      content: text(error.message),
      isError: true,
      structuredContent: { refused: error.message },
    };
  }
  logErrorClass(label, error);
  throw new Error("Autopilot couldn't decide this step. Try it again.", {
    cause: error,
  });
};

const writes = {
  destructiveHint: false,
  openWorldHint: true,
  readOnlyHint: false,
};

// Autopilot: one command from an idea to hidden products and a paused
// campaign. The merchant turns it on once in their browser; Nemotron decides
// at each approval point (lib/autopilot-decide.ts). Going live stays the
// merchant's: the campaign's confirm page.
export const registerAutopilotTools = (
  server: McpServer,
  store: Store,
  {
    autopilot,
    confirm,
  }: { autopilot: Autopilot; confirm?: BrowserConfirm | undefined }
) => {
  const unavailable = () =>
    autopilot.on && autopilot.deps !== undefined
      ? undefined
      : notConfigured(
          autopilot.on
            ? "Autopilot needs wovain's Nebius and Tavily keys. Run the journey step by step instead."
            : "Autopilot is switched off on this wovain server. Run the journey step by step instead."
        );

  server.registerTool(
    "autopilot_opt_in",
    {
      annotations: writes,
      description: `A link where the merchant turns autopilot on, in their own browser after signing in to wovain. Autopilot then decides every approval with NVIDIA Nemotron: products are created hidden, the Meta campaign is staged paused, at most $${AUTOPILOT_TERMS.maxSpendUsd} of their fal credit per run, AI-made ads labeled. Nothing goes live until they confirm the launch. The link works once, for 5 minutes.`,
      inputSchema: z.object({}),
      title: "Turn autopilot on",
    },
    async () => {
      if (confirm === undefined) {
        throw new Error("Confirmations aren't set up on this wovain server.");
      }
      const confirmUrl = await confirm.link(store.userId, {
        hash: `v${AUTOPILOT_TERMS.version}`,
        id: "autopilot",
        kind: "autopilot",
      });
      return reply(
        { confirmUrl },
        `Show the merchant this link to turn autopilot on: ${confirmUrl}\nWait until they say they confirmed, then call autopilot again.`
      );
    }
  );

  server.registerTool(
    "autopilot",
    {
      annotations: writes,
      description:
        'Start autopilot for an idea ("create a t-shirt for me", "cat lover tees"): wovain runs the whole journey with no approvals. Read get_playbook autopilot first and follow it. Needs the merchant\'s one-time opt-in (autopilot_opt_in). Pass runKey to make a retry return the same run. videos defaults to false.',
      inputSchema: autopilotStartSchema,
      title: "Start autopilot",
    },
    async (input) => {
      const off = unavailable();
      if (off !== undefined) {
        return off;
      }
      try {
        const run = await startRun(store, input);
        return reply(
          { run },
          `Autopilot run ${run.id} is ${run.status}. Follow the autopilot playbook: call autopilot_decide at each approval point.`
        );
      } catch (error) {
        return refusalOrThrow("autopilot failed:", error);
      }
    }
  );

  server.registerTool(
    "autopilot_decide",
    {
      annotations: writes,
      description:
        "Have Nemotron decide an autopilot approval point, with wovain's limits checked in code: idea (research picks the theme), design (approve, revise with fixes, or drop; approved designs publish hidden with publish_design), ads (approves up to 3 varied ad concepts; copy with prices, discounts or claims is always skipped). A design's artwork must be images generate_art made in this run (fal's result URLs): wovain reads each with OCR and refuses words its piece didn't declare. Returns the decision and its reason. You can't approve anything yourself.",
      inputSchema: z.object({
        designId: designIdSchema.optional(),
        point: decisionPointSchema,
        runId: runIdSchema,
      }),
      title: "Decide an autopilot step",
    },
    async ({ designId, point, runId }) => {
      const off = unavailable();
      if (off !== undefined || autopilot.deps === undefined) {
        return off ?? notConfigured("Autopilot isn't set up.");
      }
      const { deps } = autopilot;
      try {
        if (point === "idea") {
          const result = await decideIdea(deps, store, runId);
          return reply(result, JSON.stringify(result));
        }
        if (designId === undefined) {
          throw new AutopilotRefusedError(`Pass designId for ${point}.`);
        }
        if (point === "ads") {
          const result = await decideAds(deps, store, runId, designId);
          return reply(result, JSON.stringify(result));
        }
        const result = await decideDesign(deps, store, { designId, runId });
        return reply(result, JSON.stringify(result));
      } catch (error) {
        return refusalOrThrow("autopilot_decide failed:", error);
      }
    }
  );

  server.registerTool(
    "autopilot_status",
    {
      annotations: { readOnlyHint: true },
      description:
        "An autopilot run (the latest when runId is omitted): its status, the fal credit spent against its cap, and every decision with its reason and the limits code applied.",
      inputSchema: z.object({ runId: runIdSchema.optional() }),
      title: "Autopilot status",
    },
    async ({ runId }) => {
      const runs = await store.getAutopilotRuns();
      const run =
        runId === undefined
          ? runs.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          : runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new Error("No autopilot run found.");
      }
      return reply(
        { capUsd: AUTOPILOT_TERMS.maxSpendUsd, run },
        JSON.stringify(run)
      );
    }
  );

  server.registerTool(
    "autopilot_stop",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Stop an autopilot run (done: true when it finished normally). turnOff: true also turns autopilot off for the merchant until they opt in again. Products already created stay hidden; the campaign stays paused.",
      inputSchema: z.object({
        done: z.boolean().default(false),
        runId: runIdSchema,
        turnOff: z.boolean().default(false),
      }),
      title: "Stop autopilot",
    },
    async ({ done, runId, turnOff: off }) => {
      if (off) {
        await turnOff(store);
      }
      const run = await stopRun(store, runId, {
        done,
        reason: "stopped from the chat",
      });
      return reply(
        { run },
        `Autopilot run ${runId} is ${run.status}.${off ? " Autopilot is off." : ""}`
      );
    }
  );
};
