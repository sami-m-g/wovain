import type { EventData, EVENTS, NotifyKind } from "@wovain/core/events";
import { device } from "@wovain/db/schema/autonomy";
import { and, eq, inArray } from "drizzle-orm";
import { log } from "evlog";
import { Expo } from "expo-server-sdk";

import type { Actor } from "./actor";

// Mobile push through the Expo Push Service (openspec alerts;
// docs.expo.dev/push-notifications/sending-notifications), with
// expo-server-sdk. The Expo app (#86) saves its push token with
// devices.register; an alert goes to every phone of the merchant, and a
// token Expo no longer knows is deleted.

export type DevicePlatform = (typeof device.$inferSelect)["platform"];

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
 * messages into chunks of 100 and retries 429s itself.
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

/**
 * Saves the phone's Expo push token for the merchant. A token names one app
 * install, so a token another merchant registered (a shared phone, a new
 * sign-in) moves to this one.
 */
export const registerDevice = async (
  actor: Pick<Actor, "db" | "userId">,
  input: { platform: DevicePlatform; token: string }
) => {
  const now = new Date();
  const [row] = await actor.db
    .insert(device)
    .values({
      lastSeenAt: now,
      platform: input.platform,
      token: input.token,
      userId: actor.userId,
    })
    .onConflictDoUpdate({
      set: { lastSeenAt: now, platform: input.platform, userId: actor.userId },
      target: device.token,
    })
    .returning({ id: device.id, platform: device.platform });
  if (row === undefined) {
    throw new Error("The device was not saved");
  }
  return row;
};

// Signing out on the phone: only the merchant's own token is removed.
export const unregisterDevice = async (
  actor: Pick<Actor, "db" | "userId">,
  token: string
) => {
  const removed = await actor.db
    .delete(device)
    .where(and(eq(device.userId, actor.userId), eq(device.token, token)))
    .returning({ id: device.id });
  return { removed: removed.length };
};

export const devicesOf = async (actor: Pick<Actor, "db" | "userId">) =>
  await actor.db
    .select({ id: device.id, token: device.token })
    .from(device)
    .where(eq(device.userId, actor.userId));

export type Notification = EventData<typeof EVENTS.notify>;

// The app screen a notification opens (apps/mobile/src/app in #86).
const SCREEN: Record<NotifyKind, string> = {
  anomaly: "/kpis",
  approval: "/approvals",
  failure: "/",
  first_sale: "/kpis",
  order: "/kpis",
  rule_action: "/kpis",
  run_done: "/review",
  run_failed: "/review",
  scale_request: "/approvals",
  suggestion: "/",
};

export const pushMessagesFor = (
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
        // The app's screen (an Expo Router path), and the alert's own page
        // on the site for links that open the web.
        url: SCREEN[notification.kind],
        webUrl: notification.url,
      },
      sound: "default",
      title: notification.title,
      to,
    }));

/**
 * Sends one alert to every phone of the merchant. A failed send (Expo
 * unreachable) throws, so the Inngest step retries it; a ticket that failed
 * for one phone is logged at error level, and a token Expo reports as not
 * registered is deleted.
 */
export const deliverPush = async (
  actor: Pick<Actor, "db" | "userId">,
  notification: Notification,
  transport: PushTransport
) => {
  const devices = await devicesOf(actor);
  const messages = pushMessagesFor(
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
