import {
  acceptSuggestion,
  autopilotLog,
  autopilotStatus,
  dismissSuggestion,
  requestScan,
  requireAutopilotTriggers,
} from "@wovain/mastra/flow/autopilot";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { asOrpc } from "./approvals";

// Autopilot's triggers and decision log (openspec autopilot-triggers),
// behind the autopilot-triggers flag. `status` answers with enabled false
// when the flag is off, so the app can hide the page's link.

const bySuggestion = z.object({ suggestionId: z.string().min(1).max(64) });

export const autopilotRouter = {
  accept: protectedProcedure
    .input(bySuggestion)
    .handler(async ({ context, input }) => {
      await requireAutopilotTriggers(context);
      try {
        return await acceptSuggestion(context, input.suggestionId);
      } catch (error) {
        // The queue's refusals (denied by a spend cap, expired) as oRPC
        // errors the app shows.
        return asOrpc(error);
      }
    }),
  dismiss: protectedProcedure
    .input(bySuggestion)
    .handler(async ({ context, input }) => {
      await requireAutopilotTriggers(context);
      await dismissSuggestion(context, input.suggestionId);
      return { dismissed: true };
    }),
  log: protectedProcedure.handler(async ({ context }) => {
    await requireAutopilotTriggers(context);
    return await autopilotLog(context);
  }),
  scan: protectedProcedure.handler(async ({ context }) => {
    await requireAutopilotTriggers(context);
    return await requestScan(context);
  }),
  status: protectedProcedure.handler(
    async ({ context }) => await autopilotStatus(context)
  ),
};
