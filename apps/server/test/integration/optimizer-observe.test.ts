import { createHmac } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";
import type { Row } from "../../src/lib/report-rows.ts";
import { memoryTasks } from "../../src/lib/tasks.ts";
import { optimizerDocs } from "../../src/optimizer/docs.ts";
import { createIntake } from "../../src/optimizer/intake.ts";
import type { Call, Read } from "../../src/optimizer/read.ts";
import { createRunner } from "../../src/optimizer/run.ts";
import { createScheduler } from "../../src/optimizer/schedule.ts";
import { createTrendSource } from "../../src/optimizer/sources/trends.ts";
import { createOptimizationStore } from "../../src/optimizer/store.ts";
import { createStore } from "../../src/store.ts";
import { demoDesign, fakeQloo, qlooTaste, testStorage } from "../helpers.ts";

// Observe and reconcile (plan MR 4) on the emulators, with the merchant's
// Fourthwall and Meta stubbed at the read layer: each test answers the
// upstream tools it cares about, and every other read is `missing`.

const DAY = 86_400_000;
// 2027-01-15T07:00:00Z, so the review hour is 7.
const NOW = Date.UTC(2027, 0, 15, 7);
const SECRET = "shop-webhook-secret-0123456789";
const UID = "u1";

type Answers = Partial<
  Record<string, (args: Record<string, unknown>) => Row[]>
>;

const offer = (status: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE") => ({
  id: "off_1",
  status: "PUBLIC",
  variants: [
    {
      attributes: "Color: Black (#111111), Size: M",
      id: "v_m",
      quantity: null,
      status,
    },
  ],
});

const polledOrder = (id: string, refunded = false) => ({
  amounts: { merchandiseTotal: 30 },
  createdAt: new Date(NOW - 2 * DAY).toISOString(),
  id,
  items: [{ quantity: 1, variantId: "v_m" }],
  refundSummary: {
    hasRefunds: refunded,
    refundedViaCancel: false,
    refunds: refunded ? [{ reason: "Misprint" }] : [],
  },
  status: "CONFIRMED",
  updatedAt: new Date(NOW - DAY).toISOString(),
});

const setup = async () => {
  const storage = testStorage();
  const { db, media } = storage;
  const docs = optimizerDocs(db);
  const now = vi.fn(() => NOW);
  const tasks = memoryTasks();
  const answers: Answers = {};
  const reads = vi.fn<(provider: string, tool: string) => void>();
  const call: Call = async (provider, tool, args) => {
    reads(provider, tool);
    const answer = answers[`${provider}:${tool}`];
    const read: Read =
      answer === undefined
        ? { kind: "missing" }
        : { kind: "rows", rows: answer(args) };
    return await Promise.resolve(read);
  };
  const store = createStore(db, media, UID);
  await store.saveDesign({ ...demoDesign, productId: "off_1" });
  await store.saveCampaign({
    adAccountId: "act_111",
    campaignId: "c1",
    rulesCreated: [],
  });
  await docs
    .due(UID)
    .set({ activeUntil: NOW + DAY, enabled: true, reviewHourUtc: 7 });
  const runner = createRunner({ db, media, now, readerFor: () => call, tasks });
  return {
    answers,
    db,
    docs,
    now,
    optimization: createOptimizationStore(db, UID),
    reads,
    runner,
    scheduler: createScheduler({ db, now, tasks }),
    tasks,
  };
};

const openFindings = async (db: Firestore) => {
  const found = await optimizerDocs(db)
    .findings(UID)
    .where("status", "==", "open")
    .get();
  return found.docs.map((doc) => doc.data());
};

describe("optimizer observe and reconcile", () => {
  it("turns a signed order webhook into a ledger row for its ad and design", async () => {
    const { db, docs, optimization, runner, tasks } = await setup();
    const cipher = localCipher();
    await docs.shop("sh_1").set({ uid: UID });
    await docs.hook(UID, "fourthwall").set({
      provider: "fourthwall",
      secretCiphertext: await cipher.encrypt(
        SECRET,
        docs.hook(UID, "fourthwall").path
      ),
      status: "registered",
    });
    const intake = createIntake({
      cipher,
      customerKey: "customer-key-0123456789abcdef0123456789",
      db,
      debounceSeconds: 120,
      now: () => NOW,
      tasks,
    });
    const raw = JSON.stringify({
      data: {
        order: {
          amounts: { total: { currency: "USD", value: 30 } },
          createdAt: new Date(NOW - DAY).toISOString(),
          email: "buyer@example.com",
          id: "ord_1",
          offers: [
            {
              id: "off_1",
              variant: {
                attributes: { size: { name: "M" } },
                id: "v_m",
                quantity: 1,
              },
            },
          ],
          status: "CONFIRMED",
          trackingParams: { utm_content: "ad_1", utm_source: "facebook" },
        },
      },
      id: "evt_1",
      shopId: "sh_1",
      testMode: false,
      type: "ORDER_PLACED",
    });
    const signature = createHmac("sha256", SECRET).update(raw).digest("base64");
    await expect(
      intake.fourthwall(raw, { shop: signature })
    ).resolves.toMatchObject({ status: 200 });
    await expect(runner.run(UID, "event")).resolves.toMatchObject({
      kind: "done",
      processed: 1,
    });
    const [snapshot] = await optimization.snapshots(NOW);
    expect(snapshot?.orders).toEqual([
      expect.objectContaining({
        adId: "ad_1",
        designId: "d1",
        orderId: "ord_1",
        productId: "off_1",
        revenue: 30,
        utmSource: "facebook",
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("buyer@example.com");
  });

  it("reverses a sale when a poll finds its refund, with the reason", async () => {
    const { answers, optimization, runner } = await setup();
    answers["fourthwall:ecommerce_get-offers-by-ids"] = () => [offer()];
    answers["fourthwall:ecommerce_get-orders"] = () => [polledOrder("o1")];
    await runner.run(UID, "poll");
    answers["fourthwall:ecommerce_get-orders"] = () => [
      polledOrder("o1", true),
    ];
    await runner.run(UID, "poll");
    const days = await optimization.snapshots(NOW);
    const reversals = days.flatMap((day) => day.reversals);
    expect(reversals).toEqual([
      expect.objectContaining({
        kind: "refund",
        orderId: "o1",
        reason: "Misprint",
      }),
    ]);
    expect(days.flatMap((day) => day.orders)).toEqual([
      expect.objectContaining({ designId: "d1", orderId: "o1", size: "M" }),
    ]);
  });

  it("raises blank_out_of_stock when the product's only variant is unavailable", async () => {
    const { answers, db, runner } = await setup();
    answers["fourthwall:ecommerce_get-offers-by-ids"] = () => [
      offer("UNAVAILABLE"),
    ];
    await expect(runner.run(UID, "poll")).resolves.toMatchObject({
      kind: "done",
      opened: 1,
    });
    await expect(openFindings(db)).resolves.toEqual([
      expect.objectContaining({
        entity: { id: "off_1", kind: "product" },
        pattern: "blank_out_of_stock",
        rule: "POD-O1",
      }),
    ]);
  });

  it("closes a finding once a later run no longer sees it", async () => {
    const { answers, db, runner } = await setup();
    answers["fourthwall:ecommerce_get-offers-by-ids"] = () => [
      offer("UNAVAILABLE"),
    ];
    await runner.run(UID, "poll");
    answers["fourthwall:ecommerce_get-offers-by-ids"] = () => [offer()];
    await runner.run(UID, "poll");
    await expect(openFindings(db)).resolves.toEqual([]);
  });

  it("stores an order no webhook delivered as a poll event, once", async () => {
    const { answers, docs, runner } = await setup();
    answers["fourthwall:ecommerce_get-orders"] = () => [polledOrder("o2")];
    await expect(runner.run(UID, "poll")).resolves.toMatchObject({ missed: 1 });
    await expect(runner.run(UID, "poll")).resolves.toMatchObject({ missed: 0 });
    const events = await docs.events(UID).where("source", "==", "poll").get();
    expect(events.size).toBe(1);
    expect(events.docs[0]?.data()).toMatchObject({
      externalId: "o2",
      type: "ORDER_POLLED",
    });
  });

  it("keeps working on Fourthwall alone when Meta isn't connected", async () => {
    const { answers, optimization, reads, runner } = await setup();
    answers["fourthwall:ecommerce_get-offers-by-ids"] = () => [offer()];
    answers["fourthwall:ecommerce_get-orders"] = () => [];
    await expect(runner.run(UID, "poll")).resolves.toMatchObject({
      kind: "done",
    });
    const state = await optimization.state();
    expect(state.observed["meta"]).toMatchObject({ state: "missing" });
    expect(state.observed["fourthwall"]).toMatchObject({ state: "connected" });
    expect(reads).toHaveBeenCalledWith("meta", "ads_get_ad_entities");
  });

  it("blocks kills on an ad whose Meta purchases disagree with net sales", async () => {
    const { answers, optimization, runner } = await setup();
    const date = new Date(NOW - 5 * DAY).toISOString().slice(0, 10);
    answers["meta:ads_get_ad_entities"] = (args) =>
      args["level"] === "campaign"
        ? [{ daily_budget: 2000, effective_status: "ACTIVE", id: "c1" }]
        : [
            {
              amount_spent: 40,
              campaign_id: "c1",
              date_start: date,
              effective_status: "ACTIVE",
              id: "ad_1",
              impressions: 4000,
              link_click: 40,
              name: "wovain d1 · A",
              omni_purchase: 5,
            },
          ];
    await runner.run(UID, "poll");
    const state = await optimization.state();
    // The ad's own check fails, and so does the campaign's above it.
    expect(state.blocks).toEqual([
      expect.objectContaining({ check: "R1", entityKey: "ad:ad_1" }),
      expect.objectContaining({ check: "R1", entityKey: "campaign:c1" }),
    ]);
  });

  it("polls only while a campaign delivers, and sweeps daily either way", async () => {
    const { answers, docs, now, runner, scheduler } = await setup();
    answers["meta:ads_get_ad_entities"] = (args) =>
      args["level"] === "campaign"
        ? [{ effective_status: "ACTIVE", id: "c1" }]
        : [];
    await runner.run(UID, "poll");
    const due = await docs.due(UID).get();
    expect(due.data()).toMatchObject({ activeUntil: NOW + DAY });
    await expect(scheduler.pollTick()).resolves.toBe(1);
    // A day and a minute later, with nothing delivering since.
    now.mockReturnValue(NOW + DAY + 60_000);
    await expect(scheduler.pollTick()).resolves.toBe(0);
    now.mockReturnValue(NOW + DAY);
    await expect(scheduler.dailyTick()).resolves.toBe(1);
    // The same hour twice queues nothing more.
    await expect(scheduler.dailyTick()).resolves.toBe(0);
  });
});

describe("the shared trend cache", () => {
  it("keeps only the niche key, never one merchant's wording", async () => {
    const { db } = testStorage();
    const qloo = fakeQloo(qlooTaste);
    const trends = createTrendSource(db, qloo);
    const first = await trends.read({
      at: NOW,
      fetch: 1,
      niches: ["Ada's Secret Cat Club"],
    });
    expect(first).toEqual([
      expect.objectContaining({
        direction: "up",
        niche: "Ada's Secret Cat Club",
      }),
    ]);
    expect(qloo.requests).toHaveBeenCalledWith(
      "/search",
      expect.objectContaining({ query: "ada s secret cat club" })
    );
    const cached = await optimizerDocs(db)
      .trend("ada-s-secret-cat-club", "2027-01-15")
      .get();
    expect(JSON.stringify(cached.data())).not.toContain("Ada's");
    expect(cached.data()).toMatchObject({
      rows: [{ niche: "ada-s-secret-cat-club" }],
    });
    // Another merchant's wording of the same niche reads the cache, named their way.
    qloo.requests.mockClear();
    const second = await trends.read({
      at: NOW,
      fetch: 1,
      niches: ["ADA'S secret cat club!"],
    });
    expect(second).toEqual([
      expect.objectContaining({ niche: "ADA'S secret cat club!" }),
    ]);
    expect(qloo.requests).not.toHaveBeenCalled();
  });
});
