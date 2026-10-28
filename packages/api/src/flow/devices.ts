import { approval, device, suggestion } from "@wovain/db/schema/autonomy";
import { and, count, desc, eq } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";

// The mobile app's server side (openspec mobile-app): the merchant's phones
// and their Expo push tokens (the foundation's `device` table), and the
// inbox the app opens on. Behind the mobile-app flag.

export type DevicePlatform = (typeof device.$inferSelect)["platform"];

const INBOX_LIMIT = 50;

export const mobileAppOff = () =>
  createError({
    fix: "Turn on the mobile-app flag for this environment.",
    message: "The mobile app isn't available yet",
    status: 404,
    why: "The mobile-app flag is off.",
  });

export const isMobileAppOn = async (actor: Actor) =>
  await actor.core.flags.isOn("mobile-app", flagContextOf(actor));

export const requireMobileApp = async (actor: Actor) => {
  if (!(await isMobileAppOn(actor))) {
    throw mobileAppOff();
  }
};

/**
 * Saves the phone's Expo push token for the merchant. A token names one app
 * install, so a token another merchant registered (a shared phone, a new
 * sign-in) moves to this one: the earlier merchant stops getting pushes
 * there.
 */
export const registerDevice = async (
  actor: Actor,
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
export const unregisterDevice = async (actor: Actor, token: string) => {
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

// What the app's home tab shows: new suggestions, newest first, and how many
// approvals wait.
export const inboxOf = async (actor: Actor) => {
  const [suggestions, [pending]] = await Promise.all([
    actor.db
      .select({
        createdAt: suggestion.createdAt,
        id: suggestion.id,
        kind: suggestion.kind,
        rationale: suggestion.rationale,
        runId: suggestion.runId,
        sources: suggestion.sources,
        title: suggestion.title,
        trigger: suggestion.trigger,
      })
      .from(suggestion)
      .where(
        and(eq(suggestion.userId, actor.userId), eq(suggestion.status, "new"))
      )
      .orderBy(desc(suggestion.createdAt))
      .limit(INBOX_LIMIT),
    actor.db
      .select({ value: count() })
      .from(approval)
      .where(
        and(eq(approval.userId, actor.userId), eq(approval.status, "pending"))
      ),
  ]);
  return { pendingApprovals: pending?.value ?? 0, suggestions };
};
