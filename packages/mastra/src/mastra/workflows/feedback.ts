import { EVENTS, eventSchemas } from "@wovain/core/events";
import { connection } from "@wovain/db/schema/seller";
import { inArray } from "drizzle-orm";
import { log } from "evlog";
import type { Inngest } from "inngest";
import { z } from "zod";

import { feedbackLoopOn, learnFromResults } from "../flow/feedback";
import type { RunServices } from "./run";

// The feedback loop's daily run (openspec feedback-loop): the cron lists
// the merchants with a shop or ad account connected and sends one
// wovain/feedback.learn event each. Each merchant's loop is its own function
// run, so one failure retries alone and never blocks the others; once its
// retries are spent, onFailure logs it at error level (PostHog Error
// Tracking).

export const FEEDBACK_CRON = "TZ=UTC 30 6 * * *";
// Merchants learning at once: their MCP sessions share provider limits.
const MERCHANTS_AT_ONCE = 2;
const RETRIES = 2;

// What Inngest hands onFailure: the failed run's trigger event rides along.
const failedLearn = z.object({
  event: z.object({ data: eventSchemas[EVENTS.feedbackLearn] }),
});

export const createFeedbackFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const daily = inngest.createFunction(
    {
      concurrency: { limit: 1 },
      id: "feedback-loop-daily",
      triggers: { cron: FEEDBACK_CRON },
    },
    async ({ step }) => {
      const userIds = await step.run("merchants", async () => {
        const rows = await services.db
          .selectDistinct({ userId: connection.userId })
          .from(connection)
          .where(inArray(connection.provider, ["fourthwall", "meta"]));
        return rows.map((row) => row.userId);
      });
      if (userIds.length > 0) {
        await step.sendEvent(
          "fan-out",
          userIds.map((userId) => ({
            data: { userId },
            name: EVENTS.feedbackLearn,
          }))
        );
      }
      return { merchants: userIds.length };
    }
  );

  const merchant = inngest.createFunction(
    {
      // One loop per merchant at a time, a few merchants at once.
      concurrency: [
        { key: "event.data.userId", limit: 1 },
        { limit: MERCHANTS_AT_ONCE },
      ],
      id: "feedback-loop-merchant",
      onFailure: ({ error, event }) => {
        const failed = failedLearn.safeParse(event.data);
        log.error({
          error: {
            code: "FEEDBACK_LOOP_FAILED",
            message: error.message,
            name: "FeedbackLoopError",
            ...(error.stack === undefined ? {} : { stack: error.stack }),
          },
          feedback: {
            user_id: failed.success ? failed.data.event.data.userId : null,
          },
        });
      },
      retries: RETRIES,
      triggers: { event: EVENTS.feedbackLearn },
    },
    async ({ event, step }) => {
      const { userId } = eventSchemas[EVENTS.feedbackLearn].parse(event.data);
      return await step.run("learn", async () => {
        const actor = { ...services, userId };
        if (!(await feedbackLoopOn(actor))) {
          return { learned: false };
        }
        await learnFromResults(actor);
        return { learned: true };
      });
    }
  );

  return [daily, merchant];
};
