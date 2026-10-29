import { planAlert } from "@wovain/core/alerts";
import { EVENTS, eventSchemas } from "@wovain/core/events";
import type { EventData, NotifyKind } from "@wovain/core/events";
import { approval } from "@wovain/db/schema/autonomy";
import { and, eq } from "drizzle-orm";
import { log } from "evlog";
import { eventType, staticSchema } from "inngest";
import type { Inngest } from "inngest";
import { z } from "zod";

import type { Actor, EventSender } from "../flow/actor";
import {
  alertSettingsFor,
  deliverAlert,
  isAlertsOn,
  recordAlertFailure,
} from "../flow/alerts";
import type { RunServices } from "./run";

// The alerts service on the app's Inngest client (openspec alerts):
// - alerts-deliver owns wovain/notify: it plans the channels from the
//   merchant's settings, holds push and Telegram through quiet hours, and
//   sends each channel in its own step, so Inngest retries a channel alone
//   and never repeats one that went out;
// - alerts-approval-requested turns an approval waiting into an alert;
// - alerts-job-failed turns a merchant's job that failed for good into one.
// Each skips merchants with the alerts flag off.

// The notify schema fills defaults (a transform), which Inngest's eventType
// refuses, so the trigger carries the type only and the handler parses.
const notify = eventType(EVENTS.notify, {
  schema: staticSchema<EventData<typeof EVENTS.notify>>(),
});
const approvalRequested = eventType(EVENTS.approvalRequested, {
  schema: eventSchemas[EVENTS.approvalRequested],
});

// A notify event with its id: Inngest drops a repeat within 24 hours.
interface NotifyEvent {
  data: EventData<typeof EVENTS.notify>;
  id: string;
  name: typeof EVENTS.notify;
}

const RETRIES = 4;
const MAX_BODY = 300;
const APPROVALS_PATH = "/dashboard/autopilot";

const clip = (text: string) =>
  text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// What Inngest sends when a function fails for good: the trigger rides
// along. Only a merchant's job (its event names a userId) alerts.
const failedJob = z.object({
  error: z.object({ message: z.string() }).partial().optional(),
  event: z.object({
    data: z.object({ userId: z.string() }).loose(),
    name: z.string(),
  }),
  function_id: z.string(),
  run_id: z.string(),
});

/**
 * The alert for an approval waiting on the merchant, or undefined once it
 * no longer waits. A raise the profit rules ask for is a scale request; the
 * rules send the same alert themselves, under the same key.
 */
export const approvalAlert = async (
  actor: Pick<Actor, "db" | "userId">,
  approvalId: string
): Promise<NotifyEvent | undefined> => {
  const [row] = await actor.db
    .select({
      actionType: approval.actionType,
      idempotencyKey: approval.idempotencyKey,
      reason: approval.reason,
      status: approval.status,
      title: approval.title,
    })
    .from(approval)
    .where(and(eq(approval.userId, actor.userId), eq(approval.id, approvalId)));
  if (row?.status !== "pending") {
    return;
  }
  const kind: NotifyKind =
    row.actionType === "media.budget.change" &&
    row.idempotencyKey?.startsWith("rules:") === true
      ? "scale_request"
      : "approval";
  return {
    data: {
      actions: [{ id: "open", title: "Review" }],
      approvalId,
      body: clip(row.reason ?? "Waiting for your approval."),
      dedupeKey: `approval:${approvalId}`,
      kind,
      title: row.title,
      url: APPROVALS_PATH,
      userId: actor.userId,
    },
    id: `notify:approval:${approvalId}`,
    name: EVENTS.notify,
  };
};

// The alert for a merchant's job that failed after its retries. Runs are
// left out: their own email says a run stopped (flow/runs notifyRun).
export const failureAlert = (payload: unknown): NotifyEvent | undefined => {
  const parsed = failedJob.safeParse(payload);
  if (!parsed.success) {
    return;
  }
  const { error, event, function_id: functionId, run_id: runId } = parsed.data;
  if (functionId.includes("alerts-") || functionId.includes("workflow.")) {
    return;
  }
  const job = event.name.replace(/^wovain\//u, "").replaceAll(".", " ");
  return {
    data: {
      actions: [],
      body: clip(
        `wovain couldn't finish "${job}" after several tries. ${error?.message ?? ""}`.trim()
      ),
      dedupeKey: `failure:${runId}`,
      kind: "failure",
      title: "A background job failed",
      url: "/dashboard",
      userId: event.data.userId,
    },
    id: `notify:failure:${runId}`,
    name: EVENTS.notify,
  };
};

export const createAlertFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });
  const events: EventSender = {
    send: async (event) => await inngest.send(event),
  };

  const deliver = inngest.createFunction(
    {
      id: "alerts-deliver",
      // A failure for good: logged at error level (PostHog Error Tracking)
      // and kept on the delivery row.
      onFailure: async ({ error, event }) => {
        const original = eventSchemas[EVENTS.notify].safeParse(
          event.data.event.data
        );
        log.error({
          alert: {
            kind: original.success ? original.data.kind : undefined,
          },
          error: {
            code: "ALERT_FAILED",
            message: error.message,
            name: error.name,
          },
          userId: original.success ? original.data.userId : undefined,
        });
        if (!original.success) {
          return;
        }
        const channel = /send-(?<channel>email|push|telegram)/u.exec(
          error.message
        )?.groups?.["channel"];
        if (
          channel === "email" ||
          channel === "push" ||
          channel === "telegram"
        ) {
          await recordAlertFailure(actorFor(original.data.userId), {
            channel,
            error: error.message,
            key: original.data.dedupeKey ?? event.data.event.id ?? "",
            kind: original.data.kind,
          });
        }
      },
      retries: RETRIES,
      triggers: [notify],
    },
    async ({ event, step }) => {
      const data = eventSchemas[EVENTS.notify].parse(event.data);
      const actor = actorFor(data.userId);
      if (!(await step.run("flag", async () => await isAlertsOn(actor)))) {
        return { skipped: "alerts off" };
      }
      const key = data.dedupeKey ?? event.id ?? `${data.kind}:${data.title}`;
      const plan = await step.run("plan", async () =>
        planAlert(data.kind, await alertSettingsFor(actor), new Date()).map(
          (item) => ({
            channel: item.channel,
            holdUntil: item.holdUntil?.toISOString(),
          })
        )
      );
      const results = await Promise.all(
        plan.map(async ({ channel, holdUntil }) => {
          if (holdUntil !== undefined) {
            await step.sleepUntil(`quiet-${channel}`, holdUntil);
          }
          try {
            return {
              channel,
              ...(await step.run(
                `send-${channel}`,
                async () =>
                  await deliverAlert(actor, {
                    channel,
                    key,
                    notification: data,
                  })
              )),
            };
          } catch (error) {
            // Names the channel for onFailure, which records it.
            throw new Error(`send-${channel}: ${messageOf(error)}`, {
              cause: error,
            });
          }
        })
      );
      return { key, results };
    }
  );

  const approvalWaiting = inngest.createFunction(
    { id: "alerts-approval-requested", triggers: [approvalRequested] },
    async ({ event, step }) => {
      const actor = actorFor(event.data.userId);
      if (!(await step.run("flag", async () => await isAlertsOn(actor)))) {
        return { skipped: "alerts off" };
      }
      const notified = await step.run("notify", async () => {
        const alert = await approvalAlert(actor, event.data.approvalId);
        if (alert === undefined) {
          return false;
        }
        await events.send(alert);
        return true;
      });
      return notified
        ? { notified: event.data.approvalId }
        : { skipped: "not pending" };
    }
  );

  const jobFailed = inngest.createFunction(
    {
      id: "alerts-job-failed",
      triggers: { event: "inngest/function.failed" },
    },
    async ({ event, step }) => {
      const alert = failureAlert(event.data);
      if (alert === undefined) {
        return { skipped: "not a merchant's job" };
      }
      const actor = actorFor(alert.data.userId);
      if (!(await step.run("flag", async () => await isAlertsOn(actor)))) {
        return { skipped: "alerts off" };
      }
      await step.run("notify", async () => {
        await events.send(alert);
      });
      return { notified: alert.data.dedupeKey };
    }
  );

  return [deliver, approvalWaiting, jobFailed];
};
