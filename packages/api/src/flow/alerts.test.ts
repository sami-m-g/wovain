import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  alertDelivery,
  approval,
  device,
  telegramChat,
} from "@wovain/db/schema/autonomy";
import type { Mail } from "@wovain/email/mailer";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { GrammyError } from "grammy";
import { beforeEach, describe, expect, it } from "vitest";

import { approvalAlert, failureAlert } from "../workflows/alerts";
import type { Actor } from "./actor";
import {
  alertChannelsFor,
  alertSettingsFor,
  connectTelegram,
  deliverAlert,
  linkTelegramChat,
  saveAlertSettings,
} from "./alerts";
import type { PushMessage, PushTicket } from "./push";
import type { TelegramBot, TelegramMessage } from "./telegram";
import { startTokenOf } from "./telegram";

// The alerts service on real Postgres (PGlite, with the app's migrations),
// with fake email, Expo and Telegram.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const TOKEN = "ExponentPushToken[abc]";

const notification = {
  actions: [],
  body: "Ad 42 spent $10 with no sale.",
  kind: "rule_action" as const,
  title: "Ad paused: it isn't selling",
  url: "/dashboard/autopilot",
  userId: USER_ID,
};

// What Inngest sends when a function fails for good.
const failed = (functionId: string) => ({
  error: { message: "Meta timed out" },
  event: { data: { userId: USER_ID }, name: "wovain/optimizer.tick" },
  function_id: functionId,
  run_id: "run_1",
});

const allowAll = async () => await Promise.resolve(true);

const setup = async () => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    locale: "fr",
    name: "Merchant",
  });
  const mails: Mail[] = [];
  const pushes: PushMessage[] = [];
  const telegrams: { chatId: string; message: TelegramMessage }[] = [];
  const push = {
    tickets: (messages: PushMessage[]): PushTicket[] =>
      messages.map(() => ({ id: "t1", status: "ok" })),
  };
  const telegram = {
    failure: undefined as unknown,
    webhook: [] as string[],
  };
  const bot: TelegramBot = {
    ensureWebhook: (url) => {
      telegram.webhook.push(url);
      return Promise.resolve();
    },
    send: (chatId, message) => {
      if (telegram.failure !== undefined) {
        return Promise.reject(telegram.failure);
      }
      telegrams.push({ chatId, message });
      return Promise.resolve();
    },
    username: () => Promise.resolve("wovain_next_bot"),
    verifies: () => true,
  };
  const actor = {
    alerts: {
      push: {
        send: (messages: PushMessage[]) => {
          pushes.push(...messages);
          return Promise.resolve(push.tickets(messages));
        },
      },
      siteUrl: "https://next.wovain.com",
      telegram: bot,
    },
    core: { flags: { isOn: () => Promise.resolve(true) } },
    db: db as unknown as Database,
    events: { send: () => Promise.resolve() },
    mailer: (mail: Mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, mails, push, pushes, telegram, telegrams };
};

const linkTelegram = async (ctx: Awaited<ReturnType<typeof setup>>) => {
  const { url } = await connectTelegram(ctx.actor);
  const token = new URL(url).searchParams.get("start") ?? "";
  return await linkTelegramChat(
    ctx.db as unknown as Database,
    token,
    { id: "777", username: "merchant" },
    allowAll
  );
};

describe("alerts on Postgres", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("keeps the merchant's channels and quiet hours", async () => {
    const defaults = await alertSettingsFor(ctx.actor);
    const saved = await saveAlertSettings(ctx.actor, {
      channels: { ...defaults.channels, updates: [] },
      quietHours: { end: "07:00", start: "22:00", timeZone: "Africa/Cairo" },
    });
    expect(await alertSettingsFor(ctx.actor)).toEqual(saved);
    expect(saved.channels.updates).toEqual([]);
  });

  it("links Telegram through the deep link, once and before it expires", async () => {
    const { url } = await connectTelegram(ctx.actor);
    expect(url).toMatch(/^https:\/\/t\.me\/wovain_next_bot\?start=[\w-]{32}$/u);
    expect(ctx.telegram.webhook).toEqual([
      "https://next.wovain.com/api/telegram",
    ]);
    const token = new URL(url).searchParams.get("start") ?? "";
    expect(startTokenOf(`/start ${token}`)).toBe(token);
    expect(startTokenOf("hello")).toBeUndefined();

    const db = ctx.db as unknown as Database;
    expect(
      await linkTelegramChat(
        db,
        token,
        { id: "777", username: "merchant" },
        allowAll
      )
    ).toEqual({ locale: "fr", userId: USER_ID });
    // The token is spent.
    expect(
      await linkTelegramChat(db, token, { id: "888" }, allowAll)
    ).toBeUndefined();
    const channels = await alertChannelsFor(ctx.actor);
    expect(channels.telegram).toEqual({
      available: true,
      connected: true,
      username: "merchant",
    });
  });

  it("sends each channel once per key, however often the event comes", async () => {
    await ctx.db
      .insert(device)
      .values({ platform: "ios", token: TOKEN, userId: USER_ID });
    await linkTelegram(ctx);
    const channels = ["email", "push", "telegram"] as const;
    const first = await Promise.all(
      channels.map(
        async (channel) =>
          await deliverAlert(ctx.actor, { channel, key: "k1", notification })
      )
    );
    const again = await Promise.all(
      channels.map(
        async (channel) =>
          await deliverAlert(ctx.actor, { channel, key: "k1", notification })
      )
    );
    expect(first.map((item) => item.status)).toEqual(["sent", "sent", "sent"]);
    expect(again.map((item) => item.status)).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
    ]);
    expect(ctx.mails).toHaveLength(1);
    expect(ctx.mails[0]).toMatchObject({
      locale: "fr",
      message: { alert: "rule_action", kind: "alert" },
      to: "merchant@example.com",
    });
    expect(ctx.pushes).toEqual([
      expect.objectContaining({ title: notification.title, to: TOKEN }),
    ]);
    expect(ctx.telegrams).toEqual([
      {
        chatId: "777",
        message: {
          button: {
            text: "Ouvrir wovain",
            url: "https://next.wovain.com/dashboard/autopilot",
          },
          text: `${notification.title}\n\n${notification.body}`,
        },
      },
    ]);
  });

  it("skips a channel with nothing to reach, and retries a refused push", async () => {
    expect(
      await deliverAlert(ctx.actor, {
        channel: "push",
        key: "k2",
        notification,
      })
    ).toEqual({ reason: "no phone", status: "skipped" });
    expect(
      await deliverAlert(ctx.actor, {
        channel: "telegram",
        key: "k2",
        notification,
      })
    ).toEqual({ reason: "not connected", status: "skipped" });

    await ctx.db
      .insert(device)
      .values({ platform: "android", token: TOKEN, userId: USER_ID });
    ctx.push.tickets = (messages) =>
      messages.map(() => ({
        details: { error: "MessageRateExceeded" },
        message: "Too many",
        status: "error",
      }));
    await expect(
      deliverAlert(ctx.actor, { channel: "push", key: "k3", notification })
    ).rejects.toThrow("Expo refused");
    // Recorded as failed, so the retry claims it and sends it.
    const rows = await ctx.db.select().from(alertDelivery);
    expect(rows.map((row) => row.status).toSorted()).toEqual([
      "failed",
      "skipped",
      "skipped",
    ]);
    ctx.push.tickets = (messages) =>
      messages.map(() => ({ id: "t2", status: "ok" }));
    expect(
      await deliverAlert(ctx.actor, {
        channel: "push",
        key: "k3",
        notification,
      })
    ).toEqual({ status: "sent" });
  });

  it("skips a channel the merchant turned off after the alert was planned", async () => {
    const defaults = await alertSettingsFor(ctx.actor);
    await saveAlertSettings(ctx.actor, {
      ...defaults,
      channels: { ...defaults.channels, rule_action: ["push"] },
    });
    expect(
      await deliverAlert(ctx.actor, {
        channel: "email",
        key: "k5",
        notification,
      })
    ).toEqual({ reason: "turned off", status: "skipped" });
    expect(ctx.mails).toEqual([]);
  });

  it("never calls a provider twice for a delivery already claimed", async () => {
    // An earlier try sent the email, then failed to write that it did.
    await ctx.db.insert(alertDelivery).values({
      channel: "email",
      key: "k6",
      kind: "rule_action",
      status: "sending",
      userId: USER_ID,
    });
    expect(
      await deliverAlert(ctx.actor, {
        channel: "email",
        key: "k6",
        notification,
      })
    ).toEqual({ status: "duplicate" });
    expect(ctx.mails).toEqual([]);
  });

  it("links Telegram only for a merchant with alerts on", async () => {
    const { url } = await connectTelegram(ctx.actor);
    const token = new URL(url).searchParams.get("start") ?? "";
    const db = ctx.db as unknown as Database;
    expect(
      await linkTelegramChat(
        db,
        token,
        { id: "777" },
        async () => await Promise.resolve(false)
      )
    ).toBeUndefined();
    const [chat] = await ctx.db.select().from(telegramChat);
    expect(chat?.chatId).toBeNull();
  });

  it("unlinks a chat that blocked the bot", async () => {
    await linkTelegram(ctx);
    ctx.telegram.failure = new GrammyError(
      "Forbidden",
      {
        description: "Forbidden: bot was blocked by the user",
        error_code: 403,
        ok: false,
      },
      "sendMessage",
      {}
    );
    expect(
      await deliverAlert(ctx.actor, {
        channel: "telegram",
        key: "k4",
        notification,
      })
    ).toEqual({ reason: "chat gone", status: "skipped" });
    expect(await ctx.db.select().from(telegramChat)).toEqual([]);
  });

  it("alerts an approval waiting, as a scale request when a rule asks", async () => {
    const pending = {
      actionType: "media.budget.change" as const,
      domain: "media" as const,
      policyReason: "above_level" as const,
      proposedBy: "optimizer" as const,
      risk: "R3" as const,
      title: "Raise the daily budget from $10.00 to $12.00",
      userId: USER_ID,
    };
    const [rule, other] = await ctx.db
      .insert(approval)
      .values([
        { ...pending, idempotencyKey: "rules:c1:2026-10-29:scale:1200" },
        { ...pending, idempotencyKey: null },
      ])
      .returning({ id: approval.id });
    expect(await approvalAlert(ctx.actor, rule?.id ?? "")).toMatchObject({
      data: { dedupeKey: `approval:${rule?.id}`, kind: "scale_request" },
      id: `notify:approval:${rule?.id}`,
    });
    expect(await approvalAlert(ctx.actor, other?.id ?? "")).toMatchObject({
      data: { kind: "approval", url: "/dashboard/autopilot" },
    });
    await ctx.db.update(approval).set({ status: "rejected" });
    expect(await approvalAlert(ctx.actor, other?.id ?? "")).toBeUndefined();
  });

  it("alerts a merchant's job that failed for good, never a run or itself", () => {
    expect(failureAlert(failed("wovain-next-optimizer-tick"))).toMatchObject({
      data: {
        body: 'wovain couldn\'t finish "optimizer tick" after several tries. Meta timed out',
        dedupeKey: "failure:run_1",
        kind: "failure",
      },
    });
    expect(failureAlert(failed("wovain-next-alerts-deliver"))).toBeUndefined();
    expect(
      failureAlert(failed("wovain-next-workflow.seller-run"))
    ).toBeUndefined();
    expect(failureAlert({ event: { data: {} } })).toBeUndefined();
  });
});
