import { EVENTS, eventSchemas } from "@wovain/core/events";
import { eventType } from "inngest";
import type { Inngest } from "inngest";

import { executeMediaApproval } from "../flow/media";
import type { RunServices } from "./run";

// The media executor (openspec change media-buying-live): when a media
// approval is approved, by the merchant or settled by the policy, it
// publishes or pauses the Meta campaign and records the outcome on the
// approval. Each delivery is safe to repeat: the approval moves to
// "executing" once, and a second delivery finds it taken.

const approvalDecided = eventType(EVENTS.approvalDecided, {
  schema: eventSchemas[EVENTS.approvalDecided],
});

export const createMediaFunctions = (
  inngest: Inngest,
  services: RunServices
) => [
  inngest.createFunction(
    {
      // One execution per approval at a time.
      concurrency: { key: "event.data.approvalId", limit: 1 },
      id: "media-approval-executor",
      triggers: [approvalDecided],
    },
    async ({ event, step }) => {
      const { approvalId, domain, status, userId } = event.data;
      if (domain !== "media" || status !== "approved") {
        return { skipped: true };
      }
      const outcome = await step.run(
        "execute",
        async () =>
          await executeMediaApproval({ ...services, userId }, approvalId)
      );
      return { approvalId, status: outcome.status };
    }
  ),
];
