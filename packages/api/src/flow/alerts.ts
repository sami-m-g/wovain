import { createHash, randomBytes } from "node:crypto";

import { alertSettingsOf, alertTypeOf } from "@wovain/core/alerts";
import type { AlertChannel, AlertSettings } from "@wovain/core/alerts";
import type { Database } from "@wovain/db";
import { user } from "@wovain/db/schema/auth";
import {
  alertDelivery,
  auditEvent,
  autonomySetting,
  device,
  telegramChat,
} from "@wovain/db/schema/autonomy";
import { emailOptOut } from "@wovain/db/schema/seller";
import { pickLocale } from "@wovain/email/emails";
import type { Locale } from "@wovain/email/locales";
import { and, count, eq, gt } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";
import { deliverPush } from "./push";
import type { Notification } from "./push";
import { isChatGone } from "./telegram";

// The merchant's alerts (openspec alerts): one service delivers every
// wovain/notify event on the channels the merchant picked for its type
// (email through Resend, mobile push through Expo, Telegram through
// wovain's bot), once per channel, with quiet hours. Behind the alerts flag.

const LINK_TTL_MS = 900_000;
const LINK_TOKEN_BYTES = 24;
const DEFAULT_PATH = "/dashboard";
// apps/web's route for the bot's updates.
export const TELEGRAM_WEBHOOK_PATH = "/api/telegram";

export const alertsOff = () =>
  createError({
    fix: "Turn on the alerts flag for this environment.",
    message: "Alerts aren't available yet",
    status: 404,
    why: "The alerts flag is off.",
  });

export const isAlertsOn = async (actor: Actor) =>
  await actor.core.flags.isOn("alerts", flagContextOf(actor));

export const requireAlerts = async (actor: Actor) => {
  if (!(await isAlertsOn(actor))) {
    throw alertsOff();
  }
};

export const alertSettingsFor = async (
  actor: Pick<Actor, "db" | "userId">
): Promise<AlertSettings> => {
  const [row] = await actor.db
    .select({ alerts: autonomySetting.alerts })
    .from(autonomySetting)
    .where(eq(autonomySetting.userId, actor.userId));
  return alertSettingsOf(row?.alerts);
};

export const saveAlertSettings = async (
  actor: Pick<Actor, "db" | "userId">,
  settings: AlertSettings
): Promise<AlertSettings> => {
  const before = await alertSettingsFor(actor);
  const after = alertSettingsOf(settings);
  await actor.db
    .insert(autonomySetting)
    .values({ alerts: after, userId: actor.userId })
    .onConflictDoUpdate({
      set: { alerts: after },
      target: autonomySetting.userId,
    });
  await actor.db.insert(auditEvent).values({
    actor: actor.userId,
    after: { alerts: after },
    approvalId: null,
    before: { alerts: before },
    event: "settings_changed",
    note: null,
    userId: actor.userId,
  });
  return after;
};

/** What each channel reaches for this merchant, for Settings. */
export const alertChannelsFor = async (actor: Actor) => {
  const [[account], [phones], [chat]] = await Promise.all([
    actor.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, actor.userId)),
    actor.db
      .select({ value: count() })
      .from(device)
      .where(eq(device.userId, actor.userId)),
    actor.db
      .select({ chatId: telegramChat.chatId, username: telegramChat.username })
      .from(telegramChat)
      .where(eq(telegramChat.userId, actor.userId)),
  ]);
  return {
    email: account?.email ?? null,
    push: { devices: phones?.value ?? 0 },
    telegram: {
      available: actor.alerts?.telegram !== undefined,
      connected: chat?.chatId !== null && chat?.chatId !== undefined,
      username: chat?.username ?? null,
    },
  };
};

const hashOf = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/**
 * Starts linking Telegram: a one-time token, valid 15 minutes, in the deep
 * link t.me/<bot>?start=<token>. The bot's webhook is pointed at this
 * environment first, so the merchant's Start reaches it.
 */
export const connectTelegram = async (actor: Actor) => {
  const bot = actor.alerts?.telegram;
  if (actor.alerts === undefined || bot === undefined) {
    throw createError({
      fix: "Set the telegram-bot-token secret for this environment (infra/README.md).",
      message: "Telegram isn't set up here",
      status: 503,
      why: "TELEGRAM_BOT_TOKEN is not set.",
    });
  }
  await bot.ensureWebhook(
    new URL(TELEGRAM_WEBHOOK_PATH, actor.alerts.siteUrl).href
  );
  const username = await bot.username();
  const token = randomBytes(LINK_TOKEN_BYTES).toString("base64url");
  const linkExpiresAt = new Date(Date.now() + LINK_TTL_MS);
  await actor.db
    .insert(telegramChat)
    .values({
      linkExpiresAt,
      linkTokenHash: hashOf(token),
      userId: actor.userId,
    })
    .onConflictDoUpdate({
      set: { linkExpiresAt, linkTokenHash: hashOf(token) },
      target: telegramChat.userId,
    });
  return { url: `https://t.me/${username}?start=${token}` };
};

export const disconnectTelegram = async (
  actor: Pick<Actor, "db" | "userId">
) => {
  const removed = await actor.db
    .delete(telegramChat)
    .where(eq(telegramChat.userId, actor.userId))
    .returning({ id: telegramChat.id });
  return { removed: removed.length };
};

/**
 * The bot got /start <token>: saves the chat for the merchant whose link
 * token it is, if the token is still valid. Returns the merchant's
 * language, or undefined when the token is unknown or expired.
 */
export const linkTelegramChat = async (
  db: Database,
  token: string,
  chat: { id: string; username?: string | undefined }
): Promise<{ locale: Locale; userId: string } | undefined> => {
  const [linked] = await db
    .update(telegramChat)
    .set({
      chatId: chat.id,
      linkExpiresAt: null,
      linkTokenHash: null,
      linkedAt: new Date(),
      username: chat.username ?? null,
    })
    .where(
      and(
        eq(telegramChat.linkTokenHash, hashOf(token)),
        gt(telegramChat.linkExpiresAt, new Date())
      )
    )
    .returning({ userId: telegramChat.userId });
  if (linked === undefined) {
    return undefined;
  }
  const [account] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, linked.userId));
  return { locale: pickLocale(account?.locale), userId: linked.userId };
};

// What the bot says, in the merchant's language.
export const TELEGRAM_COPY: Record<
  Locale,
  { connected: string; expired: string; open: string }
> = {
  en: {
    connected:
      "Connected. wovain sends your alerts here. Choose which ones in Settings > Alerts.",
    expired:
      "This link has expired. Open Settings > Alerts in wovain and connect Telegram again.",
    open: "Open wovain",
  },
  es: {
    connected:
      "Conectado. wovain te enviará tus alertas aquí. Elige cuáles en Ajustes > Alertas.",
    expired:
      "Este enlace caducó. Abre Ajustes > Alertas en wovain y vuelve a conectar Telegram.",
    open: "Abrir wovain",
  },
  fr: {
    connected:
      "Connecté. wovain vous enverra vos alertes ici. Choisissez lesquelles dans Paramètres > Alertes.",
    expired:
      "Ce lien a expiré. Ouvrez Paramètres > Alertes dans wovain et reconnectez Telegram.",
    open: "Ouvrir wovain",
  },
};

export type DeliveryStatus = "duplicate" | "sent" | "skipped";

const record = async (
  actor: Pick<Actor, "db" | "userId">,
  row: {
    channel: AlertChannel;
    error?: string | undefined;
    key: string;
    kind: string;
    status: "failed" | "sent" | "skipped";
  }
) => {
  await actor.db
    .insert(alertDelivery)
    .values({ ...row, error: row.error ?? null, userId: actor.userId })
    .onConflictDoUpdate({
      set: { error: row.error ?? null, status: row.status },
      target: [alertDelivery.userId, alertDelivery.key, alertDelivery.channel],
    });
};

// An alert that failed for good on a channel, after Inngest's retries.
export const recordAlertFailure = async (
  actor: Pick<Actor, "db" | "userId">,
  row: { channel: AlertChannel; error: string; key: string; kind: string }
) => {
  await record(actor, { ...row, status: "failed" });
};

const sendOn = async (
  actor: Actor,
  channel: AlertChannel,
  notification: Notification
): Promise<{ reason?: string; status: "sent" | "skipped" }> => {
  const path = notification.url ?? DEFAULT_PATH;
  if (channel === "email") {
    const [account] = await actor.db
      .select({ email: user.email, locale: user.locale })
      .from(user)
      .where(eq(user.id, actor.userId));
    if (account === undefined) {
      return { reason: "no account", status: "skipped" };
    }
    // The merchant unsubscribed from wovain's emails (/api/unsubscribe).
    const [optedOut] = await actor.db
      .select({ email: emailOptOut.email })
      .from(emailOptOut)
      .where(eq(emailOptOut.email, account.email));
    if (optedOut !== undefined) {
      return { reason: "unsubscribed", status: "skipped" };
    }
    await actor.mailer({
      locale: account.locale,
      message: {
        alert: alertTypeOf(notification.kind),
        body: notification.body,
        kind: "alert",
        title: notification.title,
        url: path,
      },
      to: account.email,
    });
    return { status: "sent" };
  }
  if (channel === "push") {
    if (actor.alerts === undefined) {
      return { reason: "push not configured", status: "skipped" };
    }
    const result = await deliverPush(actor, notification, actor.alerts.push);
    if (result.sent > 0) {
      return { status: "sent" };
    }
    if (result.failed > 0) {
      throw new Error(`Expo refused the push to ${result.failed} phone(s)`);
    }
    return { reason: "no phone", status: "skipped" };
  }
  const bot = actor.alerts?.telegram;
  if (actor.alerts === undefined || bot === undefined) {
    return { reason: "telegram not configured", status: "skipped" };
  }
  const [chat] = await actor.db
    .select({ chatId: telegramChat.chatId, locale: user.locale })
    .from(telegramChat)
    .innerJoin(user, eq(user.id, telegramChat.userId))
    .where(eq(telegramChat.userId, actor.userId));
  if (chat?.chatId === null || chat?.chatId === undefined) {
    return { reason: "not connected", status: "skipped" };
  }
  try {
    await bot.send(chat.chatId, {
      button: {
        text: TELEGRAM_COPY[pickLocale(chat.locale)].open,
        url: new URL(path, actor.alerts.siteUrl).href,
      },
      text: `${notification.title}\n\n${notification.body}`,
    });
  } catch (error) {
    if (!isChatGone(error)) {
      throw error;
    }
    // The merchant blocked the bot or deleted the chat: unlink it, so
    // Settings shows Telegram as not connected.
    await disconnectTelegram(actor);
    return { reason: "chat gone", status: "skipped" };
  }
  return { status: "sent" };
};

/**
 * Sends one alert on one channel, once: a channel already sent (or
 * skipped) for this key is not sent again, however often the event comes.
 * A failure throws, so the Inngest step retries it.
 */
export const deliverAlert = async (
  actor: Actor,
  {
    channel,
    key,
    notification,
  }: {
    channel: AlertChannel;
    key: string;
    notification: Notification;
  }
): Promise<{ reason?: string; status: DeliveryStatus }> => {
  const [done] = await actor.db
    .select({ status: alertDelivery.status })
    .from(alertDelivery)
    .where(
      and(
        eq(alertDelivery.userId, actor.userId),
        eq(alertDelivery.key, key),
        eq(alertDelivery.channel, channel)
      )
    );
  if (done !== undefined && done.status !== "failed") {
    return { status: "duplicate" };
  }
  const outcome = await sendOn(actor, channel, notification);
  await record(actor, {
    channel,
    error: outcome.reason,
    key,
    kind: notification.kind,
    status: outcome.status,
  });
  return outcome;
};
