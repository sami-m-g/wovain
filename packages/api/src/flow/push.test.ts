import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { approval, device, suggestion } from "@wovain/db/schema/autonomy";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import {
  approvalNotification,
  suggestionNotification,
} from "../workflows/push";
import type { Actor } from "./actor";
import {
  inboxOf,
  registerDevice,
  requireMobileApp,
  unregisterDevice,
} from "./devices";
import { deliverNotification, messagesFor } from "./push";
import type { PushMessage, PushTicket, PushTransport } from "./push";

// Device tokens, the inbox and push delivery on real Postgres (PGlite, with
// the app's migrations), with a fake Expo transport.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const A = "user_a";
const B = "user_b";
const TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const OTHER = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

const setup = async (flagOn = true) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values([
    { email: "a@example.com", emailVerified: true, id: A, name: "A" },
    { email: "b@example.com", emailVerified: true, id: B, name: "B" },
  ]);
  const actorOf = (userId: string) =>
    ({
      core: { flags: { isOn: () => Promise.resolve(flagOn) } },
      db: db as unknown as Database,
      userId,
    }) as unknown as Actor;
  return { a: actorOf(A), b: actorOf(B), db };
};

// Records what it was asked to send and answers with these tickets.
const fakeTransport = (answer: (message: PushMessage) => PushTicket) => {
  const sent: PushMessage[] = [];
  const transport: PushTransport = {
    send: (messages) => {
      sent.push(...messages);
      return Promise.resolve(messages.map(answer));
    },
  };
  return { sent, transport };
};

const notification = {
  actions: [],
  body: "3 designs are ready",
  kind: "approval" as const,
  title: "Approve?",
  userId: A,
};

describe("devices", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("moves a token to the merchant who registers it last", async () => {
    await registerDevice(ctx.a, { platform: "ios", token: TOKEN });
    await registerDevice(ctx.b, { platform: "ios", token: TOKEN });
    const rows = await ctx.db.select().from(device);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(B);
  });

  it("unregisters only the merchant's own token", async () => {
    await registerDevice(ctx.a, { platform: "android", token: TOKEN });
    expect(await unregisterDevice(ctx.b, TOKEN)).toEqual({ removed: 0 });
    expect(await unregisterDevice(ctx.a, TOKEN)).toEqual({ removed: 1 });
  });

  it("lists new suggestions and counts pending approvals", async () => {
    await ctx.db.insert(suggestion).values([
      {
        kind: "drop",
        rationale: "Rising",
        title: "Y2K tees",
        trigger: "trend",
        userId: A,
      },
      {
        kind: "drop",
        rationale: "Old",
        status: "dismissed",
        title: "Gone",
        trigger: "trend",
        userId: A,
      },
    ]);
    await ctx.db.insert(approval).values({
      actionType: "store.product.publish",
      domain: "store",
      policyReason: "above_level",
      proposedBy: "autopilot",
      risk: "R2",
      status: "pending",
      title: "Publish the tee",
      userId: A,
    });
    const inbox = await inboxOf(ctx.a);
    expect(inbox.pendingApprovals).toBe(1);
    expect(inbox.suggestions.map((item) => item.title)).toEqual(["Y2K tees"]);
  });

  it("answers 404 with the flag off", async () => {
    const off = await setup(false);
    await expect(requireMobileApp(off.a)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("push delivery", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
    await registerDevice(ctx.a, { platform: "ios", token: TOKEN });
    await registerDevice(ctx.a, { platform: "android", token: OTHER });
  });

  it("sends to every device and opens the approvals tab", async () => {
    const { sent, transport } = fakeTransport(() => ({
      id: "t",
      status: "ok",
    }));
    const result = await deliverNotification(ctx.a, notification, transport);
    expect(result).toEqual({ failed: 0, removed: 0, sent: 2 });
    expect(sent.map((message) => message.to).toSorted()).toEqual(
      [OTHER, TOKEN].toSorted()
    );
    expect(sent[0]?.data["url"]).toBe("/approvals");
  });

  it("deletes a token Expo no longer knows", async () => {
    const { transport } = fakeTransport((message) =>
      message.to === TOKEN
        ? {
            details: { error: "DeviceNotRegistered" },
            message: "gone",
            status: "error",
          }
        : { id: "t", status: "ok" }
    );
    const result = await deliverNotification(ctx.a, notification, transport);
    expect(result).toEqual({ failed: 0, removed: 1, sent: 1 });
    const left = await ctx.db.select().from(device);
    expect(left.map((row) => row.token)).toEqual([OTHER]);
  });

  it("counts other failures and keeps the token", async () => {
    const { transport } = fakeTransport(() => ({
      details: { error: "MessageRateExceeded" },
      message: "slow down",
      status: "error",
    }));
    const result = await deliverNotification(ctx.a, notification, transport);
    expect(result).toEqual({ failed: 2, removed: 0, sent: 0 });
    expect(await ctx.db.select().from(device)).toHaveLength(2);
  });

  it("sends nothing to a merchant without devices", async () => {
    const { sent, transport } = fakeTransport(() => ({
      id: "t",
      status: "ok",
    }));
    const result = await deliverNotification(
      ctx.b,
      { ...notification, userId: B },
      transport
    );
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("skips strings that aren't Expo push tokens", () => {
    expect(messagesFor(["not-a-token", TOKEN], notification)).toHaveLength(1);
  });
});

describe("notify fan-in", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("turns a pending approval into an approval notification", async () => {
    const [row] = await ctx.db
      .insert(approval)
      .values({
        actionType: "store.product.publish",
        domain: "store",
        policyReason: "above_level",
        proposedBy: "autopilot",
        reason: "Sold out of the last drop",
        risk: "R2",
        status: "pending",
        title: "Publish the tee",
        userId: A,
      })
      .returning();
    const message = await approvalNotification(ctx.a, row?.id ?? "");
    expect(message?.data).toMatchObject({
      body: "Sold out of the last drop",
      kind: "approval",
      title: "Publish the tee",
    });
    // Another merchant's approval is never theirs to hear about.
    expect(await approvalNotification(ctx.b, row?.id ?? "")).toBeUndefined();
  });

  it("stays quiet once the approval is decided", async () => {
    const [row] = await ctx.db
      .insert(approval)
      .values({
        actionType: "store.product.publish",
        domain: "store",
        policyReason: "within_level",
        proposedBy: "autopilot",
        risk: "R2",
        status: "approved",
        title: "Publish the tee",
        userId: A,
      })
      .returning();
    expect(await approvalNotification(ctx.a, row?.id ?? "")).toBeUndefined();
  });

  it("turns a new suggestion into a suggestion notification", async () => {
    const [row] = await ctx.db
      .insert(suggestion)
      .values({
        kind: "drop",
        rationale: "Qloo sees anime fans moving to 90s racing",
        title: "A racing drop",
        trigger: "qloo",
        userId: A,
      })
      .returning();
    const message = await suggestionNotification(ctx.a, row?.id ?? "");
    expect(message?.data).toMatchObject({
      kind: "suggestion",
      title: "A racing drop",
    });
  });
});
