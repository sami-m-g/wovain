import { EVENTS, eventSchemas } from "@wovain/core/events";
import { eventType } from "inngest";
import type { Inngest } from "inngest";

import {
  claimMediaApproval,
  performMediaApproval,
  recordMediaOutcome,
} from "../flow/media";
import type { RunServices } from "./run";

// The media executor (openspec change media-buying-live): when a media
// approval is approved, by the merchant or settled by the policy, it
// publishes or pauses the Meta campaign and records the outcome on the
// approval. Three steps, so a retry resumes after the last one that
// finished: claim (the approval moves to "executing" once, and a second
// delivery finds it taken), perform (the Meta call and the read-back) and
// record (done or failed).

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
      const actor = { ...services, userId };
      const claimed = await step.run(
        "claim",
        async () =>
          await claimMediaApproval(actor, approvalId, { resume: true })
      );
      if (!claimed) {
        return { approvalId, skipped: true };
      }
      const outcome = await step.run(
        "perform",
        async () => await performMediaApproval(actor, approvalId)
      );
      const recorded = await step.run(
        "record",
        async () => await recordMediaOutcome(actor, approvalId, outcome)
      );
      return { approvalId, status: recorded.status };
    }
  ),
];
