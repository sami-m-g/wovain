import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { call as callProcedure } from "@orpc/server";
import { ApprovalError } from "@wovain/core/approvals";
import type { Core } from "@wovain/core/core";
import type { WovainEvent } from "@wovain/core/events";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { approval, auditEvent, drop } from "@wovain/db/schema/autonomy";
import { design, idea, product, run } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { productsRouter } from "../routers/seller";
import type { Actor } from "./actor";
import { setAutonomy } from "./approvals";
import {
  executeStoreApproval,
  proposeStoreAction,
  requestCancel,
  requestDropPublish,
  requestLaunchPromotion,
  requestProductMove,
  requestRefund,
  sampleLink,
  stageRunDrop,
} from "./store";

// Lets a test make taking the executor's lock fail.
const lockFault = vi.hoisted(() => ({ error: undefined as unknown }));

vi.mock(import("./approvals"), async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    approvalsFor: (actor: Actor) => {
      const approvals = real.approvalsFor(actor);
      return {
        ...approvals,
        record: async (input: Parameters<typeof approvals.record>[0]) => {
          if (input.status === "executing" && lockFault.error !== undefined) {
            throw lockFault.error;
          }
          return await approvals.record(input);
        },
      };
    },
  };
});

// Store actions through the approval queue on real Postgres (PGlite, with
// the app's migrations) and a fake Fourthwall MCP server.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

const LIVE_SHOP = {
  "ecommerce_get-current-shop": {
    baseUrl: "https://shop.example",
    status: "LIVE",
    verificationRestrictions: [],
  },
  "ecommerce_get-payout-info": { status: "ACTIVE" },
  "ecommerce_get-shipping-profiles": {
    enabled: true,
    shippingProfiles: [{ enabled: true }],
  },
  "ecommerce_get-shop-permissions": { groups: ["OWNER"] },
};

const fakeShop = (replies: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    if (!(tool in replies)) {
      throw new Error(`unexpected tool ${tool}`);
    }
    const reply = replies[tool];
    // A function answers per call, e.g. to fail the first few.
    return await Promise.resolve(
      typeof reply === "function" ? (reply as () => unknown)() : reply
    );
  };
  const count = (tool: string) =>
    calls.filter((entry) => entry.tool === tool).length;
  return { call, calls, count };
};

const setup = async (replies: Record<string, unknown>) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const shop = fakeShop(replies);
  const sent: WovainEvent[] = [];
  const core = {
    flags: { isOn: async () => await Promise.resolve(true) },
    upstream: {
      session: async (
        _provider: ProviderId,
        _grant: unknown,
        _log: unknown,
        work: (call: ToolCall) => Promise<unknown>
      ) => await work(shop.call),
    },
  } as unknown as Core;
  const actor = {
    core,
    db: db as unknown as Database,
    events: {
      send: async (event: WovainEvent) => {
        sent.push(event);
        await Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, sent, shop };
};

// A run with one approved design and its hidden product.
const seedProduct = async (db: Awaited<ReturnType<typeof setup>>["db"]) => {
  const [started] = await db
    .insert(run)
    .values({ seed: "Desert dusk", status: "running", userId: USER_ID })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {} as never,
      runId: started?.id ?? null,
      score: 80,
      seed: "Desert dusk",
      theme: "Desert",
      userId: USER_ID,
    })
    .returning();
  const [drafted] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: "https://v3.fal.media/a.png",
      artworkWidth: 10,
      brief: {
        artPrompt: "dunes",
        description: "d",
        garmentColors: [],
        printedText: [],
        title: "Dune Tee",
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      status: "approved",
      userId: USER_ID,
    })
    .returning();
  const [made] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      customizationId: "cus_1",
      designId: drafted?.id ?? "",
      mediaUri: "https://cdn/m.png",
      mockups: [],
      offerId: "off_1",
      price: 32,
      userId: USER_ID,
    })
    .returning();
  if (started === undefined || made === undefined) {
    throw new Error("seed failed");
  }
  return { productId: made.id, runId: started.id };
};

const SHOP_WRITES = {
  ...LIVE_SHOP,
  "ecommerce_create-collection": { id: "cltn_1", state: "HIDDEN" },
  "ecommerce_get-offers-by-ids": {
    offers: [{ id: "off_1", slug: "dune-tee", status: "HIDDEN" }],
  },
  "ecommerce_update-collection-state": {
    id: "cltn_1",
    slug: "desert-dusk",
    state: "PUBLIC",
  },
  "ecommerce_update-offer-status": { ok: true },
};

describe("a run's drop", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup(SHOP_WRITES);
  });

  it("stays hidden in review and waits for the merchant at suggest", async () => {
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: false,
      productIds: [productId],
    });
    expect(staged?.status).toBe("pending");
    const [row] = await ctx.db
      .select()
      .from(product)
      .where(eq(product.id, productId));
    expect(row?.status).toBe("in_review");
    const [saved] = await ctx.db.select().from(drop);
    expect(saved?.collectionId).toBe("cltn_1");
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(0);

    // Staged twice (a retried step): one drop, one collection, one approval.
    await stageRunDrop(ctx.actor, runId, {
      autopilot: false,
      productIds: [productId],
    });
    expect(await ctx.db.select().from(drop)).toHaveLength(1);
    expect(await ctx.db.select().from(approval)).toHaveLength(1);
    expect(ctx.shop.count("ecommerce_create-collection")).toBe(1);
  });

  it("publishes alone at publish_ads_paused, once, with its collection", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: true,
      productIds: [productId],
    });
    expect(staged?.status).toBe("approved");
    expect(
      ctx.sent.some(
        (event) =>
          event.name === "wovain/approval.decided" &&
          event.data.status === "approved"
      )
    ).toBe(true);

    const approvalId = staged?.approvalId ?? "";
    expect(await executeStoreApproval(ctx.actor, approvalId)).toEqual({
      done: approvalId,
    });
    // A second delivery of the same decision does nothing.
    expect(await executeStoreApproval(ctx.actor, approvalId)).toEqual({
      skipped: "done",
    });
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(1);
    expect(ctx.shop.count("ecommerce_update-collection-state")).toBe(1);
    const [row] = await ctx.db
      .select()
      .from(product)
      .where(eq(product.id, productId));
    expect(row?.status).toBe("public");
    const [saved] = await ctx.db.select().from(drop);
    expect(saved?.status).toBe("live");
  });
});

describe("the executor", () => {
  it("refuses to publish while the shop isn't ready, and records why", async () => {
    const ctx = await setup({
      ...SHOP_WRITES,
      "ecommerce_get-current-shop": {
        baseUrl: "https://shop.example",
        status: "COMING_SOON",
        verificationRestrictions: [],
      },
    });
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: true,
      productIds: [productId],
    });
    const approvalId = staged?.approvalId ?? "";
    expect(await executeStoreApproval(ctx.actor, approvalId)).toEqual({
      failed: approvalId,
    });
    const [row] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, approvalId));
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("isn't ready");
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(0);

    // Once the shop is fixed, asking again queues a fresh publish.
    const again = await requestDropPublish(ctx.actor, row?.dropId ?? "");
    expect(again.id).not.toBe(approvalId);
    expect(again.status).toBe("approved");
  });
});

describe("merchant requests", () => {
  it("approves an R2 request in the merchant's name and audits it", async () => {
    const ctx = await setup(SHOP_WRITES);
    const { productId } = await seedProduct(ctx.db);
    await ctx.db
      .update(product)
      .set({
        productUrl: "https://shop.example/products/dune-tee",
        status: "public",
      })
      .where(eq(product.id, productId));
    const queued = await requestProductMove(ctx.actor, productId, "unpublish");
    expect(queued.status).toBe("approved");
    expect(queued.decidedBy).toBe(USER_ID);
    expect(queued.inverse).toEqual({
      productId,
      type: "store.product.publish",
    });
    const events = await ctx.db.select().from(auditEvent);
    expect(events.map((entry) => entry.event)).toEqual(
      expect.arrayContaining(["enqueued", "approved"])
    );
  });

  it("refuses a move the lifecycle doesn't allow", async () => {
    const ctx = await setup(SHOP_WRITES);
    const { productId } = await seedProduct(ctx.db);
    await expect(
      requestProductMove(ctx.actor, productId, "unpublish")
    ).rejects.toThrow("can't be moved");
  });

  it("leaves a refund pending with Fourthwall's preview on the card", async () => {
    const ctx = await setup({
      "ecommerce_preview-refund-cost": { chargeAmount: 5, fromBalance: 27.5 },
    });
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const queued = await requestRefund(ctx.actor, {
      amountCents: 3250,
      currency: "USD",
      friendlyId: "T4YTE8HA",
      orderId: "ord-1",
      reason: "Arrived damaged",
    });
    expect(queued.status).toBe("pending");
    expect(queued.risk).toBe("R4");
    expect(queued.costPreview).toMatchObject({
      amountCents: 3250,
      chargeToCardCents: 500,
      currency: "USD",
    });
    expect(queued.costPreview?.label).toContain(
      "5.00 USD charged to your card"
    );
    expect(ctx.shop.count("ecommerce_refund-order")).toBe(0);
  });

  it("refuses to queue a cancel Fourthwall says is too late", async () => {
    const ctx = await setup({
      "ecommerce_get-order-cancellation-by-ids": {
        results: [
          {
            fullyCancellable: false,
            notCancellableReason: "IN_PRODUCTION_OR_DELIVERING",
            partiallyCancellable: false,
          },
        ],
      },
    });
    await expect(
      requestCancel(ctx.actor, {
        friendlyId: "T4YTE8HA",
        orderId: "ord-1",
        reason: "Customer asked",
      })
    ).rejects.toThrow("can't be cancelled");
    expect(await ctx.db.select().from(approval)).toHaveLength(0);
  });
});

// The procedure as the website (a session) or ChatGPT (an MCP token) calls it.
const publishThrough = async (
  ctx: Awaited<ReturnType<typeof setup>>,
  productId: string,
  via: "web" | "chatgpt"
) =>
  await callProcedure(
    productsRouter.publish,
    { id: productId },
    {
      context: {
        ...ctx.actor,
        ...(via === "chatgpt"
          ? { mcpUserId: USER_ID }
          : { session: { user: { id: USER_ID } } }),
      } as never,
    }
  );

describe("products.publish with store-management on", () => {
  it("queues an agent's publish for approval and leaves the offer hidden", async () => {
    const ctx = await setup(SHOP_WRITES);
    const { productId } = await seedProduct(ctx.db);
    const published = await publishThrough(ctx, productId, "chatgpt");
    expect(published.status).toBe("in_review");
    expect(published.approval?.status).toBe("pending");
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(0);
    const [queued] = await ctx.db.select().from(approval);
    expect(queued?.actionType).toBe("store.product.publish");
    expect(queued?.proposedBy).toBe("store_agent");

    // Asking again returns the same approval.
    const again = await publishThrough(ctx, productId, "chatgpt");
    expect(again.approval?.id).toBe(published.approval?.id);
    expect(await ctx.db.select().from(approval)).toHaveLength(1);
  });

  it("approves the merchant's own click and still publishes only through the executor", async () => {
    const ctx = await setup(SHOP_WRITES);
    const { productId } = await seedProduct(ctx.db);
    const published = await publishThrough(ctx, productId, "web");
    expect(published.status).toBe("in_review");
    expect(published.approval?.status).toBe("approved");
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(0);

    expect(
      await executeStoreApproval(ctx.actor, published.approval?.id ?? "")
    ).toEqual({ done: published.approval?.id });
    const [row] = await ctx.db
      .select()
      .from(product)
      .where(eq(product.id, productId));
    expect(row?.status).toBe("public");
  });
});

describe("the executor's lock", () => {
  it("rethrows a failure that isn't a lost race and runs nothing", async () => {
    const ctx = await setup(SHOP_WRITES);
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: true,
      productIds: [productId],
    });
    const approvalId = staged?.approvalId ?? "";
    lockFault.error = new Error("connection terminated");
    try {
      await expect(executeStoreApproval(ctx.actor, approvalId)).rejects.toThrow(
        "connection terminated"
      );
      // A refused transition while the approval is still approved is not a
      // lost race either.
      lockFault.error = new ApprovalError("BAD_TRANSITION", "refused");
      await expect(executeStoreApproval(ctx.actor, approvalId)).rejects.toThrow(
        "refused"
      );
    } finally {
      lockFault.error = undefined;
    }
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(0);
    const [row] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, approvalId));
    expect(row?.status).toBe("approved");
  });
});

describe("undoing a drop's publish", () => {
  it("hides the drop's live products and its collection", async () => {
    const ctx = await setup({
      ...SHOP_WRITES,
      "ecommerce_get-offers-by-ids": {
        offers: [{ id: "off_1", slug: "dune-tee", status: "PUBLIC" }],
      },
    });
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: true,
      productIds: [productId],
    });
    await ctx.db
      .update(product)
      .set({ status: "public" })
      .where(eq(product.id, productId));
    const [published] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, staged?.approvalId ?? ""));
    expect(published?.inverse).toEqual({
      dropId: staged?.dropId,
      type: "store.drop.unpublish",
    });

    const undo = await proposeStoreAction(ctx.actor, {
      payload: { dropId: staged?.dropId },
      proposedBy: "merchant",
      title: "Unpublish the drop",
      type: "store.drop.unpublish",
    });
    expect(await executeStoreApproval(ctx.actor, undo.approval.id)).toEqual({
      done: undo.approval.id,
    });
    expect(
      ctx.shop.calls.find(
        (entry) => entry.tool === "ecommerce_update-collection-state"
      )?.args
    ).toMatchObject({ collectionId: "cltn_1", state: "HIDDEN" });
    expect(ctx.shop.count("ecommerce_update-offer-status")).toBe(1);
    const [row] = await ctx.db
      .select()
      .from(product)
      .where(eq(product.id, productId));
    expect(row?.status).toBe("paused");
    const [saved] = await ctx.db.select().from(drop);
    expect(saved?.status).toBe("paused");
  });
});

describe("a launch code that couldn't be switched off", () => {
  it("is repaired by the merchant's retry instead of created twice", async () => {
    let deactivateFailures = 3;
    const ctx = await setup({
      ...SHOP_WRITES,
      "ecommerce_create-shop-promotion": { id: "prm_1" },
      "ecommerce_deactivate-promotion": () => {
        if (deactivateFailures > 0) {
          deactivateFailures -= 1;
          return { bulkError: "try again later" };
        }
        return { ok: true };
      },
      "ecommerce_get-promotions": {
        results: [{ code: "DUNE10", id: "prm_1", status: "LIVE" }],
      },
    });
    const { productId, runId } = await seedProduct(ctx.db);
    const staged = await stageRunDrop(ctx.actor, runId, {
      autopilot: false,
      productIds: [productId],
    });
    const plan = {
      code: "DUNE10",
      dropId: staged?.dropId ?? "",
      endsAt: new Date("2026-11-08T00:00:00Z"),
      percentage: 10,
      startsAt: new Date("2026-11-06T00:00:00Z"),
    };
    const first = await requestLaunchPromotion(ctx.actor, plan);
    expect(await executeStoreApproval(ctx.actor, first.id)).toEqual({
      failed: first.id,
    });
    const [failed] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, first.id));
    expect(failed?.error).toContain("is live");

    const retry = await requestLaunchPromotion(ctx.actor, plan);
    expect(retry.id).not.toBe(first.id);
    expect(await executeStoreApproval(ctx.actor, retry.id)).toEqual({
      done: retry.id,
    });
    expect(ctx.shop.count("ecommerce_create-shop-promotion")).toBe(1);
    expect(ctx.shop.count("ecommerce_deactivate-promotion")).toBe(4);
  });
});

describe("samples", () => {
  it("records the sample checkout in the queue, decided by the designer", async () => {
    const ctx = await setup({
      ...LIVE_SHOP,
      "ecommerce_create-sample-checkout": { checkoutPath: "/checkout/s_1" },
      "ecommerce_get-offers-by-ids": {
        offers: [
          {
            id: "off_1",
            status: "HIDDEN",
            variants: [{ id: "var_m", name: "M" }],
          },
        ],
      },
    });
    const { productId } = await seedProduct(ctx.db);
    const sample = await sampleLink(ctx.actor, {
      productId,
      variantId: "var_m",
    });
    expect(sample.url).toBe("https://shop.example/checkout/s_1");
    const [row] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, sample.approvalId));
    expect(row).toMatchObject({
      actionType: "store.sample.checkout",
      decidedBy: USER_ID,
      result: { url: sample.url },
      risk: "R4",
      status: "done",
    });
  });
});
