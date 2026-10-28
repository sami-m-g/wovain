import { z } from "zod";

import {
  acceptSuggestion,
  autopilotLog,
  autopilotStatus,
  dismissSuggestion,
  requestScan,
  requireAutopilotTriggers,
} from "../flow/autopilot";
import { protectedProcedure } from "../index";

// Autopilot's triggers and decision log (openspec autopilot-triggers),
// behind the autopilot-triggers flag. `status` answers with enabled false
// when the flag is off, so the app can hide the page's link.

const bySuggestion = z.object({ suggestionId: z.string().min(1).max(64) });

export const autopilotRouter = {
  accept: protectedProcedure
    .input(bySuggestion)
    .handler(async ({ context, input }) => {
      await requireAutopilotTriggers(context);
      return await acceptSuggestion(context, input.suggestionId);
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
