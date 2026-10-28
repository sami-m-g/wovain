import { EVENTS, eventSchemas } from "@wovain/core/events";
import { log } from "evlog";
import type { Inngest } from "inngest";
import { NonRetriableError } from "inngest";

import type { Actor } from "../flow/actor";
import { approvalsFor } from "../flow/approvals";
import {
  buildDropItem,
  dropItems,
  executeDropPublish,
  failDropItem,
  reviewDrop,
} from "../flow/drops";
import type { RunServices } from "./run";

// Drops on Inngest (openspec design-drops). The build makes each product in
// its own step, so no step outlives a Cloud Run request and a product that
// fails for good (after its retries) is saved as failed, logged, and the
// rest of the drop still builds. The publish executor acts on an approved
// store.drop.publish, whether the merchant or the policy approved it.

const PUBLISH = "store.drop.publish";

export const createDropFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });

  const build = inngest.createFunction(
    {
      // One build per drop at a time; a second request waits.
      concurrency: { key: "event.data.dropId", limit: 1 },
      id: "drop-build",
      triggers: { event: EVENTS.dropBuildRequested },
    },
    async ({ event, step }) => {
      const parsed = eventSchemas[EVENTS.dropBuildRequested].safeParse(
        event.data
      );
      if (!parsed.success) {
        throw new NonRetriableError("A drop build event without a drop");
      }
      const { dropId, userId } = parsed.data;
      const actor = actorFor(userId);
      const ids = await step.run(
        "items",
        async () =>
          await dropItems(actor, dropId).then((rows) =>
            rows.map((row) => row.id)
          )
      );
      for (const itemId of ids) {
        try {
          // One product per step, in order.
          // oxlint-disable-next-line no-await-in-loop
          await step.run(`item-${itemId}`, async () => {
            const built = await buildDropItem(actor, dropId, itemId);
            return { id: built.id, status: built.status };
          });
        } catch (error) {
          // oxlint-disable-next-line no-await-in-loop
          await step.run(`fail-${itemId}`, async () => {
            const rows = await dropItems(actor, dropId);
            const row = rows.find((each) => each.id === itemId);
            if (row !== undefined) {
              await failDropItem(actor, row, error);
            }
            return { failed: itemId };
          });
        }
      }
      return await step.run("review", async () => {
        const reviewed = await reviewDrop(actor, dropId);
        return { dropId: reviewed.id, status: reviewed.status };
      });
    }
  );

  const publish = inngest.createFunction(
    {
      id: "drop-publish",
      triggers: { event: EVENTS.approvalDecided },
    },
    async ({ event, step }) => {
      const parsed = eventSchemas[EVENTS.approvalDecided].safeParse(event.data);
      if (
        !parsed.success ||
        parsed.data.actionType !== PUBLISH ||
        parsed.data.status !== "approved"
      ) {
        return { skipped: true };
      }
      const { approvalId, userId } = parsed.data;
      const actor = actorFor(userId);
      const approvals = approvalsFor(actor);
      const approval = await step.run(
        "approval",
        async () => await approvals.get(userId, approvalId)
      );
      const { dropId } = approval.payload as { dropId?: unknown };
      if (typeof dropId !== "string") {
        throw new NonRetriableError("The approval names no drop");
      }
      await step.run(
        "executing",
        async () =>
          await approvals.record({
            actor: "store_agent",
            approvalId,
            status: "executing",
            userId,
          })
      );
      try {
        const live = await step.run("publish", async () => {
          const row = await executeDropPublish(actor, dropId);
          return { collectionId: row.collectionId, dropId: row.id };
        });
        await step.run(
          "done",
          async () =>
            await approvals.record({
              actor: "store_agent",
              approvalId,
              result: live,
              status: "done",
              userId,
            })
        );
        return live;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Logged inside the step, so a replay doesn't log it again.
        await step.run("failed", async () => {
          log.error({
            approval: { id: approvalId },
            drop: { id: dropId },
            error: {
              code: "DROP_PUBLISH_FAILED",
              message: `Publishing a drop failed: ${message}`,
              name: "DropPublishFailed",
            },
            userId,
          });
          return await approvals.record({
            actor: "store_agent",
            approvalId,
            error: message,
            status: "failed",
            userId,
          });
        });
        throw error;
      }
    }
  );

  return [build, publish];
};
