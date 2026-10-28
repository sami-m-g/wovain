import type { EventData, EVENTS, NotifyKind } from "@wovain/core/events";
import { device } from "@wovain/db/schema/autonomy";
import { and, eq, inArray } from "drizzle-orm";
import { log } from "evlog";
import { Expo } from "expo-server-sdk";

import type { Actor } from "./actor";
import { devicesOf } from "./devices";

// Push notifications to the merchant's phones through the Expo Push Service
// (openspec mobile-app). One wovain/notify event goes to every device the
// merchant registered; a token Expo no longer knows is deleted.

export interface PushMessage {
  body: string;
  // What the app reads when the notification is tapped.
  data: Record<string, unknown>;
  sound: "default";
  title: string;
  to: string;
}

export type PushTicket =
  | { id: string; status: "ok" }
  | {
      details?: { error?: string | undefined } | undefined;
      message: string;
      status: "error";
    };

// Where pushes go: Expo in the app, a fake in tests.
export interface PushTransport {
  send: (messages: PushMessage[]) => Promise<PushTicket[]>;
}

/**
 * The Expo Push Service. `accessToken` (EXPO_ACCESS_TOKEN) is needed only
 * once enhanced push security is on for the Expo project. The SDK splits
 * the messages into chunks of 100, and retries 429s itself.
 */
export const expoTransport = (accessToken?: string): PushTransport => {
  const expo = new Expo(
    accessToken === undefined || accessToken === "" ? {} : { accessToken }
  );
  return {
    send: async (messages) => {
      const tickets: PushTicket[] = [];
      for (const chunk of expo.chunkPushNotifications(messages)) {
        // Chunks go one after another, so a ticket lines up with its message.
        // oxlint-disable-next-line no-await-in-loop
        tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
      }
      return tickets;
    },
  };
};

export type Notification = EventData<typeof EVENTS.notify>;

// The app screen a notification opens (apps/mobile/src/app).
const SCREEN: Record<NotifyKind, string> = {
  anomaly: "/kpis",
  approval: "/approvals",
  order: "/kpis",
  run_done: "/review",
  run_failed: "/review",
  suggestion: "/",
};

export const messagesFor = (
  tokens: string[],
  notification: Notification
): PushMessage[] =>
  tokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((to) => ({
      body: notification.body,
      data: {
        actions: notification.actions ?? [],
        approvalId: notification.approvalId,
        kind: notification.kind,
        runId: notification.runId,
        url: SCREEN[notification.kind],
      },
      sound: "default",
      title: notification.title,
      to,
    }));

/**
 * Sends one notification to every device of the merchant. A failed send
 * (Expo unreachable) throws, so the Inngest step retries it; a ticket that
 * failed for one device is logged, and a token Expo reports as not
 * registered is deleted.
 */
export const deliverNotification = async (
  actor: Pick<Actor, "db" | "userId">,
  notification: Notification,
  transport: PushTransport
) => {
  const devices = await devicesOf(actor);
  const messages = messagesFor(
    devices.map((item) => item.token),
    notification
  );
  if (messages.length === 0) {
    return { failed: 0, removed: 0, sent: 0 };
  }
  const tickets = await transport.send(messages);
  const stale: string[] = [];
  let failed = 0;
  for (const [index, ticket] of tickets.entries()) {
    if (ticket.status === "ok") {
      continue;
    }
    const token = messages[index]?.to;
    if (ticket.details?.error === "DeviceNotRegistered" && token) {
      stale.push(token);
      continue;
    }
    failed += 1;
    log.error({
      error: {
        code: ticket.details?.error ?? "PUSH_FAILED",
        message: ticket.message,
        name: "PushError",
      },
      push: { kind: notification.kind },
      userId: actor.userId,
    });
  }
  if (stale.length > 0) {
    await actor.db
      .delete(device)
      .where(
        and(eq(device.userId, actor.userId), inArray(device.token, stale))
      );
  }
  return {
    failed,
    removed: stale.length,
    sent: tickets.length - failed - stale.length,
  };
};
