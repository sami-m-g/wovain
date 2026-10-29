import { EVENTS, eventSchemas } from "@wovain/core/events";
import { campaign } from "@wovain/db/schema/seller";
import type { Inngest } from "inngest";
import { NonRetriableError } from "inngest";
import type { z } from "zod";

import type { Actor } from "../flow/actor";
import { syncBackstop } from "../flow/backstop";
import {
  finishOptimizerApproval,
  OPTIMIZER_ACTIONS,
  optimizeMerchant,
  writeOptimizerApproval,
} from "../flow/optimizer";
import type { RunServices } from "./run";

// The ads optimizer on Inngest (openspec ads-optimizer):
// - every 30 minutes, one optimizer.tick per merchant with a campaign;
// - a tick reviews that merchant's campaigns (one tick per merchant at a
//   time) and enqueues at most one change per campaign;
// - an approved optimizer action, by the merchant or by the policy, is
//   performed on Meta.
// The ads-optimizer flag is checked per merchant inside the tick.

export const OPTIMIZER_CRON = "*/30 * * * *";

const actionFilter = OPTIMIZER_ACTIONS.map(
  (type) => `event.data.actionType == "${type}"`
).join(" || ");

const parse = <T>(schema: z.ZodType<T>, name: string, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new NonRetriableError(`Malformed ${name} event`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
};

export const createOptimizerFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });

  const schedule = inngest.createFunction(
    { id: "ads-optimizer-cron", triggers: [{ cron: OPTIMIZER_CRON }] },
    async ({ step }) => {
      const merchants = await step.run("merchants", async () => {
        const rows = await services.db
          .selectDistinct({ userId: campaign.userId })
          .from(campaign);
        return rows.map((row) => row.userId);
      });
      if (merchants.length === 0) {
        return { merchants: 0 };
      }
      await step.sendEvent(
        "fan-out",
        merchants.map((userId) => ({
          data: { userId },
          name: EVENTS.optimizerTick,
        }))
      );
      return { merchants: merchants.length };
    }
  );

  const tick = inngest.createFunction(
    {
      concurrency: { key: "event.data.userId", limit: 1 },
      id: "ads-optimizer-tick",
      triggers: [{ event: EVENTS.optimizerTick }],
    },
    async ({ event, step }) => {
      const { campaignId, userId } = parse(
        eventSchemas[EVENTS.optimizerTick],
        EVENTS.optimizerTick,
        event.data
      );
      const outcomes = await step.run(
        "optimize",
        async () => await optimizeMerchant(actorFor(userId), { campaignId })
      );
      // The Meta backstop (openspec meta-backstop) follows wovain's rules
      // and campaigns; its own step, so a Graph failure retries alone.
      const backstop = await step.run(
        "backstop",
        async () => await syncBackstop(actorFor(userId))
      );
      return { backstop, outcomes };
    }
  );

  const execute = inngest.createFunction(
    {
      id: "ads-optimizer-execute",
      triggers: [
        {
          event: EVENTS.approvalDecided,
          if: `event.data.status == "approved" && (${actionFilter})`,
        },
      ],
    },
    async ({ event, step }) => {
      const { approvalId, userId } = parse(
        eventSchemas[EVENTS.approvalDecided],
        EVENTS.approvalDecided,
        event.data
      );
      // Two steps: once Meta is written, a retry redoes only the
      // bookkeeping, never the write.
      const write = await step.run(
        "write",
        async () => await writeOptimizerApproval(actorFor(userId), approvalId)
      );
      if (write.kind !== "written") {
        return write.kind;
      }
      await step.run(
        "finish",
        async () =>
          await finishOptimizerApproval(actorFor(userId), approvalId, write)
      );
      return "done";
    }
  );

  return [schedule, tick, execute];
};
