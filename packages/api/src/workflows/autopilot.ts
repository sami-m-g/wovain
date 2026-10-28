import { EVENTS, eventSchemas } from "@wovain/core/events";
import type { Inngest } from "inngest";

import type { Actor, EventSender, RunEngine } from "../flow/actor";
import {
  actOnSuggestion,
  brandsToScan,
  executeRunStart,
  scanBrand,
} from "../flow/autopilot";
import type { RunServices } from "./run";

// Autopilot's Inngest functions (openspec autopilot-triggers):
// - autopilot-scan-schedule: every 6 hours, one scan event per brand.
// - autopilot-scan: one brand's scan, at most once per 6 hours per brand
//   and never two at once, so "Scan now" and the cron can't double up.
// - autopilot-act: a new suggestion goes to the approval queue.
// - autopilot-execute: an approved autopilot.run.start starts the run.
// Each body runs inside step.run, so a retry after a crash skips what
// already happened.

const SCAN_CRON = "0 */6 * * *";
const SCAN_PERIOD = "6h";
// Brands scanned at once across the app: Qloo and Tavily rate limits.
const SCAN_CONCURRENCY = 5;
const RUN_START = "autopilot.run.start";

export const createAutopilotFunctions = ({
  events,
  inngest,
  runs,
  services,
}: {
  events: EventSender;
  inngest: Inngest;
  runs: RunEngine;
  services: RunServices;
}) => {
  const actorFor = (userId: string): Actor => ({
    ...services,
    events,
    runs,
    userId,
  });

  const schedule = inngest.createFunction(
    { id: "autopilot-scan-schedule", triggers: [{ cron: SCAN_CRON }] },
    async ({ step }) => {
      const userIds = await step.run(
        "brands",
        async () => await brandsToScan(services.db)
      );
      if (userIds.length > 0) {
        await step.sendEvent(
          "fan-out",
          userIds.map((userId) => ({
            data: { reason: "schedule" as const, userId },
            name: EVENTS.autopilotScan,
          }))
        );
      }
      return { brands: userIds.length };
    }
  );

  const scan = inngest.createFunction(
    {
      concurrency: [
        { key: "event.data.userId", limit: 1 },
        { limit: SCAN_CONCURRENCY },
      ],
      id: "autopilot-scan",
      // One scheduled and one manual scan per brand every 6 hours.
      rateLimit: {
        key: `event.data.userId + "-" + event.data.reason`,
        limit: 1,
        period: SCAN_PERIOD,
      },
      triggers: [{ event: EVENTS.autopilotScan }],
    },
    async ({ event, step }) => {
      const { reason, userId } = eventSchemas[EVENTS.autopilotScan].parse(
        event.data
      );
      return await step.run(
        "scan",
        async () => await scanBrand(actorFor(userId), reason)
      );
    }
  );

  const act = inngest.createFunction(
    {
      concurrency: [{ key: "event.data.userId", limit: 1 }],
      id: "autopilot-act",
      triggers: [
        {
          event: EVENTS.triggerFired,
          if: "event.data.suggestionId != null",
        },
      ],
    },
    async ({ event, step }) => {
      const { suggestionId, userId } = eventSchemas[EVENTS.triggerFired].parse(
        event.data
      );
      if (suggestionId === undefined) {
        return { skipped: true };
      }
      const outcome = await step.run(
        "act",
        async () => await actOnSuggestion(actorFor(userId), suggestionId)
      );
      return { outcome };
    }
  );

  const execute = inngest.createFunction(
    {
      concurrency: [{ key: "event.data.userId", limit: 1 }],
      id: "autopilot-execute",
      triggers: [
        {
          event: EVENTS.approvalDecided,
          if: `event.data.status == "approved" && event.data.actionType == "${RUN_START}"`,
        },
      ],
    },
    async ({ event, step }) => {
      const { approvalId, userId } = eventSchemas[EVENTS.approvalDecided].parse(
        event.data
      );
      return await step.run(
        "start-run",
        async () => await executeRunStart(actorFor(userId), approvalId)
      );
    }
  );

  return [schedule, scan, act, execute];
};
