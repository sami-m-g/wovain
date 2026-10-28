import { EVENTS, eventSchemas } from "@wovain/core/events";
import type { EventData, WovainEvent } from "@wovain/core/events";
import { approval, suggestion } from "@wovain/db/schema/autonomy";
import { and, eq } from "drizzle-orm";
import { eventType, staticSchema } from "inngest";
import type { Inngest } from "inngest";

import type { Actor, EventSender } from "../flow/actor";
import { isMobileAppOn } from "../flow/devices";
import { deliverNotification } from "../flow/push";
import type { PushTransport } from "../flow/push";
import type { RunServices } from "./run";

// Push notifications on the app's Inngest client (openspec mobile-app):
// `push-notify` owns delivery of wovain/notify; the other two turn an
// approval waiting and a new suggestion into a notify event. All three skip
// merchants with the mobile-app flag off.

// The notify and trigger schemas fill defaults (a transform), which
// Inngest's eventType refuses, so triggers carry the types only and each
// handler parses the payload with the zod schema.
const notify = eventType(EVENTS.notify, {
  schema: staticSchema<EventData<typeof EVENTS.notify>>(),
});
const approvalRequested = eventType(EVENTS.approvalRequested, {
  schema: eventSchemas[EVENTS.approvalRequested],
});
const triggerFired = eventType(EVENTS.triggerFired, {
  schema: staticSchema<EventData<typeof EVENTS.triggerFired>>(),
});

const MAX_BODY = 180;

const clip = (text: string) =>
  text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;

// The notify event for an approval waiting on the merchant, or undefined
// when it no longer waits.
export const approvalNotification = async (
  actor: Pick<Actor, "db" | "userId">,
  approvalId: string
) => {
  const [row] = await actor.db
    .select({
      reason: approval.reason,
      status: approval.status,
      title: approval.title,
    })
    .from(approval)
    .where(and(eq(approval.userId, actor.userId), eq(approval.id, approvalId)));
  if (row?.status !== "pending") {
    return;
  }
  return {
    data: {
      actions: [{ id: "open", title: "Review" }],
      approvalId,
      body: clip(row.reason ?? "Waiting for your approval"),
      kind: "approval" as const,
      title: row.title,
      userId: actor.userId,
    },
    name: EVENTS.notify,
  };
};

// The notify event for a new suggestion, or undefined once it's decided.
export const suggestionNotification = async (
  actor: Pick<Actor, "db" | "userId">,
  suggestionId: string
) => {
  const [row] = await actor.db
    .select({
      rationale: suggestion.rationale,
      runId: suggestion.runId,
      status: suggestion.status,
      title: suggestion.title,
    })
    .from(suggestion)
    .where(
      and(eq(suggestion.userId, actor.userId), eq(suggestion.id, suggestionId))
    );
  if (row?.status !== "new") {
    return;
  }
  return {
    data: {
      actions: [{ id: "open", title: "Open" }],
      body: clip(row.rationale),
      kind: "suggestion" as const,
      title: row.title,
      userId: actor.userId,
      ...(row.runId === null ? {} : { runId: row.runId }),
    },
    name: EVENTS.notify,
  };
};

export const createPushFunctions = (
  inngest: Inngest,
  services: RunServices,
  transport: PushTransport
) => {
  const actorFor = (userId: string): Actor => ({ ...services, userId });
  const events: EventSender = {
    send: async (event) => await inngest.send(event),
  };
  // Sends the notify event when there is one; true when it was sent.
  const relay = async (message: WovainEvent | undefined) => {
    if (message === undefined) {
      return false;
    }
    await events.send(message);
    return true;
  };

  const pushNotify = inngest.createFunction(
    { id: "push-notify", triggers: [notify] },
    async ({ event, step }) => {
      const data = eventSchemas[EVENTS.notify].parse(event.data);
      const actor = actorFor(data.userId);
      if (!(await step.run("flag", async () => await isMobileAppOn(actor)))) {
        return { skipped: "mobile-app off" };
      }
      return await step.run(
        "deliver",
        async () => await deliverNotification(actor, data, transport)
      );
    }
  );

  const pushApproval = inngest.createFunction(
    { id: "push-approval-requested", triggers: [approvalRequested] },
    async ({ event, step }) => {
      const actor = actorFor(event.data.userId);
      const notified = await step.run(
        "notify",
        async () =>
          await relay(await approvalNotification(actor, event.data.approvalId))
      );
      return notified
        ? { notified: event.data.approvalId }
        : { skipped: "not pending" };
    }
  );

  const pushSuggestion = inngest.createFunction(
    { id: "push-suggestion", triggers: [triggerFired] },
    async ({ event, step }) => {
      const { suggestionId, userId } = eventSchemas[EVENTS.triggerFired].parse(
        event.data
      );
      if (suggestionId === undefined) {
        return { skipped: "no suggestion" };
      }
      const notified = await step.run(
        "notify",
        async () =>
          await relay(
            await suggestionNotification(actorFor(userId), suggestionId)
          )
      );
      return notified ? { notified: suggestionId } : { skipped: "not new" };
    }
  );

  return [pushNotify, pushApproval, pushSuggestion];
};
