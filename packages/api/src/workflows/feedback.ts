import { connection } from "@wovain/db/schema/seller";
import { inArray } from "drizzle-orm";
import type { Inngest } from "inngest";

import { feedbackLoopOn, learnFromResults } from "../flow/feedback";
import type { RunServices } from "./run";

// The feedback loop's daily run (openspec feedback-loop): for each merchant
// with a shop or ad account connected and the feedback-loop flag on, the
// last days' results are snapshotted and the score weights re-fit. Each
// merchant is its own step, so one failure retries alone and never blocks
// the others.

export const FEEDBACK_CRON = "TZ=UTC 30 6 * * *";

export const createFeedbackFunction = (
  inngest: Inngest,
  services: RunServices
) =>
  inngest.createFunction(
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
      let learned = 0;
      for (const userId of userIds) {
        // Sequential on purpose: each merchant's MCP sessions stay short
        // and the providers' rate limits are shared.
        // oxlint-disable-next-line no-await-in-loop
        const done = await step.run(`learn-${userId}`, async () => {
          const actor = { ...services, userId };
          if (!(await feedbackLoopOn(actor))) {
            return false;
          }
          await learnFromResults(actor);
          return true;
        });
        learned += done ? 1 : 0;
      }
      return { learned, merchants: userIds.length };
    }
  );
