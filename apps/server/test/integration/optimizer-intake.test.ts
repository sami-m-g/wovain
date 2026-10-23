import { createHmac } from "node:crypto";

import type { CollectionReference, Query } from "firebase-admin/firestore";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";
import { memoryTasks } from "../../src/lib/tasks.ts";
import { optimizerDocs } from "../../src/optimizer/docs.ts";
import { createIntake } from "../../src/optimizer/intake.ts";
import { createRegistrar } from "../../src/optimizer/register.ts";
import { createRunner } from "../../src/optimizer/run.ts";
import { createScheduler } from "../../src/optimizer/schedule.ts";
import { createTaskRoutes } from "../../src/routes/tasks.ts";
import { createWebhookRoutes } from "../../src/routes/webhooks.ts";
import { testStorage } from "../helpers.ts";

const SITE = "https://site.example";
const SECRET = "shop-webhook-secret-0123456789";
const APP_SECRET = "meta-app-secret";
const NOW = 1_800_000_000_000;

// A fake Fourthwall Platform API: the shop, then the created webhook.
const fakeFourthwall = vi.fn(async (input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : input.toString();
  const body = url.endsWith("/shops/current")
    ? { id: "sh_1" }
    : { id: "wh_1", secret: SECRET };
  return await Promise.resolve(Response.json(body));
});

// A merchant whose Fourthwall webhook is registered (through the registrar)
// and whose Meta ad account routes to them, plus a second merchant on Meta.
const setup = async () => {
  const { db, media } = testStorage();
  const cipher = localCipher();
  const tasks = memoryTasks();
  const now = vi.fn(() => NOW);
  await createRegistrar({
    cipher,
    db,
    fetch: fakeFourthwall,
    site: SITE,
  }).enable("u1", "fw-token");
  const docs = optimizerDocs(db);
  await docs.adAccount("111").set({ uid: "u1" });
  await docs.adAccount("222").set({ uid: "u2" });
  const intake = createIntake({
    cipher,
    customerKey: "customer-key-0123456789abcdef0123456789",
    db,
    debounceSeconds: 120,
    metaAppSecret: APP_SECRET,
    now,
    tasks,
  });
  const app = createWebhookRoutes({ intake, metaVerifyToken: "verify-me" });
  return { app, db, docs, media, now, tasks };
};

const order = (id: string, shopId = "sh_1") =>
  JSON.stringify({
    data: {
      order: {
        email: "buyer@example.com",
        id: `ord_${id}`,
        offers: [],
        shipping: { address: { name: "Ada Buyer" } },
        status: "CONFIRMED",
      },
    },
    id: `evt_${id}`,
    shopId,
    testMode: false,
    type: "ORDER_PLACED",
  });

const hmac = (secret: string, raw: string, encoding: "base64" | "hex") =>
  createHmac("sha256", secret).update(raw).digest(encoding);

const answer = async (response: Response) => ({
  status: response.status,
  text: await response.text(),
});

const fourthwall = async (app: Hono, raw: string, secret = SECRET) =>
  await answer(
    await app.request("/webhooks/fourthwall", {
      body: raw,
      headers: { "x-fourthwall-hmac-sha256": hmac(secret, raw, "base64") },
      method: "POST",
    })
  );

const meta = async (app: Hono, raw: string, secret = APP_SECRET) =>
  await answer(
    await app.request("/webhooks/meta", {
      body: raw,
      headers: { "x-hub-signature-256": `sha256=${hmac(secret, raw, "hex")}` },
      method: "POST",
    })
  );

const count = async (query: CollectionReference | Query) => {
  const snapshot = await query.get();
  return snapshot.size;
};

describe("Fourthwall webhooks", () => {
  it("registers the webhook with its secret encrypted", async () => {
    const { docs } = await setup();
    const hook = await docs.hook("u1", "fourthwall").get();
    expect(hook.data()).toMatchObject({
      status: "registered",
      webhookId: "wh_1",
    });
    expect(JSON.stringify(hook.data())).not.toContain(SECRET);
    const shop = await docs.shop("sh_1").get();
    expect(shop.data()).toEqual({ uid: "u1" });
  });

  it("refuses a bad or missing signature and stores nothing", async () => {
    const { app, docs } = await setup();
    const wrong = await fourthwall(app, order("1"), "wrong");
    const unsigned = await app.request("/webhooks/fourthwall", {
      body: order("1"),
      method: "POST",
    });
    expect([wrong.status, unsigned.status]).toEqual([401, 401]);
    await expect(count(docs.events("u1"))).resolves.toBe(0);
  });

  it("answers an unknown shop exactly like a bad signature", async () => {
    const { app, docs } = await setup();
    const unknown = await fourthwall(app, order("1", "sh_other"));
    const forged = await fourthwall(app, order("1"), "wrong");
    expect(unknown).toEqual(forged);
    expect(unknown.status).toBe(401);
    await expect(count(docs.events("u1"))).resolves.toBe(0);
  });

  it("decrypts a shop's secret once a minute and throttles forgeries", async () => {
    const { db, docs, tasks } = await setup();
    const cipher = localCipher();
    const hookRef = docs.hook("u1", "fourthwall");
    await hookRef.set(
      {
        secretCiphertext: await cipher.encrypt(SECRET, hookRef.path),
      },
      { merge: true }
    );
    const decrypt = vi.spyOn(cipher, "decrypt");
    const intake = createIntake({
      cipher,
      customerKey: "customer-key-0123456789abcdef0123456789",
      db,
      debounceSeconds: 120,
      now: () => NOW,
      tasks,
    });
    const app = createWebhookRoutes({ intake });
    const statuses: number[] = [];
    for (const index of Array.from({ length: 12 }, (_, n) => n)) {
      // oxlint-disable-next-line no-await-in-loop
      const reply = await fourthwall(app, order(String(index)), "wrong");
      statuses.push(reply.status);
    }
    expect(new Set(statuses)).toEqual(new Set([401]));
    expect(decrypt).toHaveBeenCalledTimes(1);
    // The flood doesn't lock the shop out: a real delivery still passes.
    const signed = await fourthwall(app, order("ok"));
    expect(signed).toEqual({ status: 200, text: "stored" });
  });

  it("takes a Platform App delivery after a flood of forgeries", async () => {
    const { db, tasks } = await setup();
    const intake = createIntake({
      cipher: localCipher(),
      customerKey: "customer-key-0123456789abcdef0123456789",
      db,
      debounceSeconds: 120,
      fourthwallAppKey: "platform-app-key-0123456789",
      now: () => NOW,
      tasks,
    });
    const app = createWebhookRoutes({ intake });
    const forged = await Promise.all(
      Array.from(
        { length: 15 },
        async (_, n) => await fourthwall(app, order(`f${String(n)}`), "wrong")
      )
    );
    expect(new Set(forged.map((reply) => reply.status))).toEqual(
      new Set([401])
    );
    // A Platform App signature skips the per-shop path and its throttle.
    const raw = order("app");
    const byApp = await answer(
      await app.request("/webhooks/fourthwall", {
        body: raw,
        headers: {
          "x-fourthwall-hmac-apps-sha256": hmac(
            "platform-app-key-0123456789",
            raw,
            "base64"
          ),
        },
        method: "POST",
      })
    );
    expect(byApp).toEqual({ status: 200, text: "stored" });
  });

  it("refuses to register a shop another merchant connected", async () => {
    const { db, docs } = await setup();
    const registrar = createRegistrar({
      cipher: localCipher(),
      db,
      fetch: fakeFourthwall,
      site: SITE,
    });
    await expect(registrar.enable("u9", "fw-token")).rejects.toThrow(
      "another wovain account"
    );
    const shop = await docs.shop("sh_1").get();
    expect(shop.data()).toEqual({ uid: "u1" });
    const hook = await docs.hook("u9", "fourthwall").get();
    expect(hook.exists).toBe(false);
  });

  it("stores the same event once, without the buyer's details", async () => {
    const { app, docs } = await setup();
    const first = await fourthwall(app, order("1"));
    const again = await fourthwall(app, order("1"));
    expect([first.text, again.text]).toEqual(["stored", "duplicate"]);
    const events = await docs.events("u1").get();
    expect(events.size).toBe(1);
    const stored = JSON.stringify(events.docs[0]?.data());
    expect(stored).not.toContain("buyer@example.com");
    expect(stored).not.toContain("Ada Buyer");
  });

  it("makes one task for a burst of 20 orders in one window", async () => {
    const { app, now, tasks } = await setup();
    const statuses: number[] = [];
    for (const index of Array.from({ length: 20 }, (_, n) => n)) {
      now.mockReturnValue(NOW + index * 1000);
      // In order: each delivery sees the clock set just before it.
      // oxlint-disable-next-line no-await-in-loop
      const reply = await fourthwall(app, order(String(index)));
      statuses.push(reply.status);
    }
    expect(new Set(statuses)).toEqual(new Set([200]));
    expect([...tasks.tasks.keys()]).toEqual([
      `u1-run-${String(Math.floor(NOW / 120_000))}`,
    ]);
  });

  it("refuses events while no customer key is configured", async () => {
    const { db, docs, tasks } = await setup();
    const intake = createIntake({
      cipher: localCipher(),
      customerKey: undefined,
      db,
      debounceSeconds: 120,
      tasks,
    });
    const app = createWebhookRoutes({ intake });
    const reply = await fourthwall(app, order("1"));
    expect(reply.status).toBe(503);
    await expect(count(docs.events("u1"))).resolves.toBe(0);
  });

  it("refuses a body over 1 MB", async () => {
    const { app } = await setup();
    const reply = await fourthwall(app, "x".repeat(1024 * 1024 + 1));
    expect(reply.status).toBe(413);
  });
});

const challenge = (token: string) =>
  `/webhooks/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;

const change = (id: string, ad: string) => ({
  changes: [{ field: "effective_status", value: { id: ad } }],
  id,
  time: 1,
});

describe("Meta webhooks", () => {
  it("answers the subscription challenge only for our verify token", async () => {
    const { app } = await setup();
    const ok = await answer(await app.request(challenge("verify-me")));
    const bad = await answer(await app.request(challenge("nope")));
    expect(ok).toEqual({ status: 200, text: "12345" });
    expect(bad.status).toBe(403);
  });

  it("routes each change of a mixed batch to its merchant, once", async () => {
    const { app, docs, tasks } = await setup();
    const raw = JSON.stringify({
      entry: [
        change("act_111", "ad_1"),
        change("222", "ad_2"),
        change("act_999", "ad_3"),
      ],
      object: "ad_account",
    });
    const first = await meta(app, raw);
    const again = await meta(app, raw);
    expect([first.status, again.status]).toEqual([200, 200]);
    await expect(count(docs.events("u1"))).resolves.toBe(1);
    await expect(count(docs.events("u2"))).resolves.toBe(1);
    expect(tasks.tasks.size).toBe(2);
  });

  it("refuses an unsigned batch", async () => {
    const { app, docs } = await setup();
    const raw = JSON.stringify({ entry: [], object: "ad_account" });
    const reply = await meta(app, raw, "wrong");
    expect(reply.status).toBe(401);
    await expect(count(docs.events("u1"))).resolves.toBe(0);
  });
});

// The run route over the fixture above; `verified` stands in for the OIDC
// check (unit-tested in optimizer-signatures.test.ts).
const taskRoutes = async (verified: boolean) => {
  const fixture = await setup();
  const runner = createRunner({
    db: fixture.db,
    media: fixture.media,
    now: fixture.now,
    readerFor: () => async () =>
      await Promise.resolve({ kind: "missing" as const }),
    tasks: fixture.tasks,
  });
  const app = createTaskRoutes({
    runner,
    scheduler: createScheduler({ db: fixture.db, tasks: fixture.tasks }),
    site: SITE,
    verify: async () => await Promise.resolve(verified),
  });
  const post = async (uid = "u1") => {
    const response = await app.request("/tasks/optimizer/run", {
      body: JSON.stringify({ reason: "event", uid }),
      headers: { authorization: "Bearer t" },
      method: "POST",
    });
    return {
      body: response.ok ? ((await response.json()) as unknown) : undefined,
      status: response.status,
    };
  };
  return { ...fixture, post };
};

describe("/tasks/optimizer/run", () => {
  it("refuses a request without a valid task token", async () => {
    const { post } = await taskRoutes(false);
    const reply = await post();
    expect(reply.status).toBe(401);
  });

  it("marks the merchant's events processed", async () => {
    const { app, docs, post } = await taskRoutes(true);
    await fourthwall(app, order("1"));
    await fourthwall(app, order("2"));
    const reply = await post();
    expect(reply.body).toMatchObject({ kind: "done", processed: 2 });
    const pending = docs.events("u1").where("pending", "==", true);
    await expect(count(pending)).resolves.toBe(0);
  });

  it("re-enqueues itself when another run holds the lease", async () => {
    const { docs, post, tasks } = await taskRoutes(true);
    await docs.state("u1").set({ leaseUntil: NOW + 60_000 });
    const reply = await post();
    expect(reply.body).toEqual({ kind: "busy" });
    expect([...tasks.tasks.values()].at(-1)).toMatchObject({
      body: { reason: "retry", uid: "u1" },
      scheduleAt: NOW + 60_000,
    });
  });

  it("skips a merchant who hasn't turned the optimizer on", async () => {
    const { post } = await taskRoutes(true);
    const reply = await post("u3");
    expect(reply.body).toEqual({ kind: "disabled" });
  });
});
