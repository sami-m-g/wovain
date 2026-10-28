import { EVENTS, eventSchemas } from "@wovain/core/events";
import { log } from "evlog";
import type { Inngest } from "inngest";

import type { Actor } from "../flow/actor";
import { approvalsFor } from "../flow/approvals";
import {
  executeStoreApproval,
  promotionWindow,
  switchPromotion,
} from "../flow/store";
import type { RunServices } from "./run";

// The store's executors on Inngest (openspec store-management): an
// approved store action (by the merchant or by the autonomy policy) runs
// once; a launch promotion is switched on at its start and off at its end,
// since Fourthwall promotions have no schedule of their own.

const APPROVED_STORE =
  "event.data.domain == 'store' && event.data.status == 'approved'";

// The decision's data, checked: Inngest hands it over untyped.
const decided = (data: unknown) =>
  eventSchemas[EVENTS.approvalDecided].parse(data);

export const createStoreFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });

  // Never retried: a refund or cancel must not run twice. The approval's
  // `executing` state is the lock; a failure is recorded on the approval
  // and logged at error level (flow/store executeStoreApproval).
  const execute = inngest.createFunction(
    {
      id: "store-execute-approval",
      idempotency: "event.data.approvalId",
      retries: 0,
      triggers: [
        {
          event: EVENTS.approvalDecided,
          if: `${APPROVED_STORE} && event.data.actionType != 'store.promotion.activate'`,
        },
      ],
    },
    async ({ event, step }) => {
      const { approvalId, userId } = decided(event.data);
      return await step.run(
        "execute",
        async () => await executeStoreApproval(actorFor(userId), approvalId)
      );
    }
  );

  // The launch window: on at startsAt, off at endsAt. Switching off is
  // retried (a code left live past its end costs margin); the outcome is
  // recorded on the activation approval.
  const promotionSchedule = inngest.createFunction(
    {
      id: "store-promotion-schedule",
      idempotency: "event.data.approvalId",
      // Out of retries: the code may be live past its end, or never went
      // live. Logged at error level and recorded on the approval.
      onFailure: async ({ error, event }) => {
        const { approvalId, userId } = decided(event.data.event.data);
        log.error({
          error: {
            message: `Launch promotion schedule failed: ${error.message}`,
            name: "PromotionScheduleFailed",
          },
          store: { approvalId },
          userId,
        });
        await approvalsFor(actorFor(userId)).record({
          actor: "store_agent",
          approvalId,
          error: error.message.slice(0, 500),
          status: "failed",
          userId,
        });
      },
      retries: 3,
      triggers: [
        {
          event: EVENTS.approvalDecided,
          if: `${APPROVED_STORE} && event.data.actionType == 'store.promotion.activate'`,
        },
      ],
    },
    async ({ event, step }) => {
      const { approvalId, userId } = decided(event.data);
      const window = await step.run("claim", async () => {
        const approvals = approvalsFor(actorFor(userId));
        const approval = await approvals.get(userId, approvalId);
        await approvals.record({
          actor: "store_agent",
          approvalId,
          status: "executing",
          userId,
        });
        return promotionWindow(approval);
      });
      await step.sleepUntil("until-start", window.startsAt);
      await step.run(
        "switch-on",
        async () =>
          await switchPromotion(actorFor(userId), window.promotionId, true)
      );
      await step.sleepUntil("until-end", window.endsAt);
      await step.run(
        "switch-off",
        async () =>
          await switchPromotion(actorFor(userId), window.promotionId, false)
      );
      await step.run(
        "done",
        async () =>
          await approvalsFor(actorFor(userId)).record({
            actor: "store_agent",
            approvalId,
            result: {
              endedAt: window.endsAt,
              promotionId: window.promotionId,
              startedAt: window.startsAt,
            },
            status: "done",
            userId,
          })
      );
      return { promotionId: window.promotionId };
    }
  );

  return [execute, promotionSchedule];
};
