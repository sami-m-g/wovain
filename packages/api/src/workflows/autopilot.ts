import { EVENTS, eventSchemas } from "@wovain/core/events";
import type { Inngest } from "inngest";

import type { Actor, EventSender, RunEngine } from "../flow/actor";
import {
  actOnSuggestion,
  announcementsFor,
  AUTOPILOT_TRIGGERS,
  brandsToScan,
  finishRunStart,
  saveScanSuggestion,
  scanSignals,
  startApprovedRun,
} from "../flow/autopilot";
import type { RunServices } from "./run";

// Autopilot's Inngest functions (openspec autopilot-triggers):
// - autopilot-scan-schedule: every 6 hours, one scan event per brand.
// - autopilot-scan: one brand's scan, at most once per 6 hours per brand
//   and never two at once, so "Scan now" and the cron can't double up.
// - autopilot-act: a new autopilot suggestion (a drop from a qloo or
//   trend trigger) goes to the approval queue.
// - autopilot-execute: an approved autopilot.run.start starts the run.
// Each side effect is its own step, so a retry after a crash skips what
// already happened: a scan saves each suggestion in one step and announces
// it in another, with event IDs per suggestion, and a run start records
// its run in a step after the one that started it.

const SCAN_CRON = "0 */6 * * *";
const SCAN_PERIOD = "6h";
// Brands scanned at once across the app: Qloo and Tavily rate limits.
const SCAN_CONCURRENCY = 5;
const RUN_START = "autopilot.run.start";
const OWN_TRIGGER = AUTOPILOT_TRIGGERS.map(
  (kind) => `event.data.kind == "${kind}"`
).join(" || ");

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
      const actor = actorFor(userId);
      const { picked, status } = await step.run(
        "signals",
        async () => await scanSignals(actor, reason)
      );
      const suggestionIds = await Promise.all(
        picked.map(async (one) => {
          const id = await step.run(
            `save-${one.match.key}`,
            async () => await saveScanSuggestion(actor, one)
          );
          await step.sendEvent(
            `announce-${id}`,
            announcementsFor(userId, id, one.match)
          );
          return id;
        })
      );
      return { status, suggestionIds };
    }
  );

  const act = inngest.createFunction(
    {
      concurrency: [{ key: "event.data.userId", limit: 1 }],
      id: "autopilot-act",
      triggers: [
        {
          event: EVENTS.triggerFired,
          if: `event.data.suggestionId != null && (${OWN_TRIGGER})`,
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
      const actor = actorFor(userId);
      const outcome = await step.run(
        "start-run",
        async () => await startApprovedRun(actor, approvalId)
      );
      if (outcome.status !== "started") {
        return outcome;
      }
      return await step.run(
        "record-run",
        async () => await finishRunStart(actor, approvalId, outcome)
      );
    }
  );

  return [schedule, scan, act, execute];
};
