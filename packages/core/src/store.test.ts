import { describe, expect, it, vi } from "vitest";

import {
  baseCostCeiling,
  discountKeepsProfit,
  priceFor,
  sizePrices,
} from "./pricing";
import {
  canMove,
  cancelOrder,
  createGiftCards,
  createInactivePromotion,
  DEACTIVATE_ATTEMPTS,
  evaluateReadiness,
  findPromotionByCode,
  listGiftCards,
  listOrders,
  listPromotions,
  PromotionLeftLiveError,
  nextStatus,
  offerVariants,
  previewRefund,
  readShopFacts,
  setOfferVisibility,
  setSizePrices,
  sizeOf,
} from "./store";
import type { ShopFacts } from "./store";
import type { ToolCall } from "./upstream";

const READY: ShopFacts = {
  baseUrl: "https://shop.example",
  enabledShippingProfiles: 1,
  hosts: ["shop.example"],
  name: "Atelier",
  payoutStatus: "ACTIVE",
  shippingEnabled: true,
  siteStatus: "LIVE",
  verificationRestrictions: [],
};

// A fake MCP connection: answers by tool name and records every call.
const fake = (byTool: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = (tool, args) => {
    calls.push({ args, tool });
    return Promise.resolve(byTool[tool] ?? {});
  };
  return { call, calls };
};

describe("evaluateReadiness", () => {
  it("is ready when the shop is live, verified, ships and pays out", () => {
    expect(evaluateReadiness(READY).ready).toBe(true);
  });

  it("blocks on a shop that isn't live or is held for verification", () => {
    for (const patch of [
      { siteStatus: "COMING_SOON" },
      { verificationRestrictions: ["storefront_noindex"] },
    ] satisfies Partial<ShopFacts>[]) {
      expect(evaluateReadiness({ ...READY, ...patch }).ready).toBe(false);
    }
  });

  it("only warns when payouts aren't set up yet", () => {
    const readiness = evaluateReadiness({
      ...READY,
      payoutStatus: "IN_PROGRESS",
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.find((check) => check.id === "payouts")?.ok).toBe(
      false
    );
  });
});

describe("readShopFacts", () => {
  it("reads the four replies, wherever their fields sit", async () => {
    const { call } = fake({
      "ecommerce_get-current-shop": {
        shop: {
          baseUrl: "https://shop.example",
          name: "Atelier",
          status: "LIVE",
          verificationRestrictions: [],
        },
      },
      "ecommerce_get-payout-info": { status: "ACTIVE" },
      "ecommerce_get-shipping-profiles": {
        enabled: true,
        shippingProfiles: [{ enabled: true }, { enabled: false }],
      },
    });
    expect(await readShopFacts(call)).toEqual(READY);
  });

  it("reads the shop's admin slug from its Fourthwall subdomain", async () => {
    const { call } = fake({
      "ecommerce_get-current-shop": {
        internalDomain: "Wovain-Goods.fourthwall.com",
        status: "COMING_SOON",
      },
    });
    const facts = await readShopFacts(call);
    expect(facts.slug).toBe("wovain-goods");
  });

  it("sells without shipping set: Fourthwall ships what it makes", () => {
    expect(
      evaluateReadiness({
        ...READY,
        enabledShippingProfiles: 0,
        shippingEnabled: false,
      }).ready
    ).toBe(true);
  });

  it("treats a missing reply as not ready", async () => {
    const { call } = fake({});
    expect(evaluateReadiness(await readShopFacts(call)).ready).toBe(false);
  });
});

describe("product lifecycle", () => {
  it("moves draft → review → live → paused → live → retired", () => {
    expect(canMove("hidden", "review")).toBe(true);
    expect(canMove("in_review", "publish")).toBe(true);
    expect(canMove("public", "unpublish")).toBe(true);
    expect(canMove("paused", "publish")).toBe(true);
    expect(canMove("public", "retire")).toBe(true);
    expect(nextStatus("unpublish")).toBe("paused");
  });

  it("never moves a retired product", () => {
    for (const move of ["review", "publish", "unpublish", "retire"] as const) {
      expect(canMove("retired", move)).toBe(false);
    }
  });

  it("reads the offer before hiding it and skips a no-op", async () => {
    const { call, calls } = fake({
      "ecommerce_get-offers-by-ids": {
        offers: [{ id: "o1", status: "HIDDEN" }],
      },
    });
    await setOfferVisibility(call, "o1", "HIDDEN");
    expect(calls.map((entry) => entry.tool)).toEqual([
      "ecommerce_get-offers-by-ids",
    ]);
    await setOfferVisibility(call, "o1", "ARCHIVED");
    expect(calls.at(-1)).toEqual({
      args: { offerId: "o1", status: "ARCHIVED" },
      tool: "ecommerce_update-offer-status",
    });
  });
});

describe("createInactivePromotion", () => {
  it("creates the code on the drop's products, then ends it until launch", async () => {
    const { call, calls } = fake({
      "ecommerce_create-shop-promotion": { id: "prm_1" },
    });
    const id = await createInactivePromotion(call, {
      code: "DESERT15",
      maxUses: 50,
      offerIds: ["o1"],
      percentage: 15,
    });
    expect(id).toBe("prm_1");
    expect(calls).toEqual([
      {
        args: {
          code: "DESERT15",
          discountType: "PERCENTAGE",
          maxUses: 50,
          percentage: 15,
          productIds: ["o1"],
        },
        tool: "ecommerce_create-shop-promotion",
      },
      {
        args: { promotionId: "prm_1" },
        tool: "ecommerce_deactivate-promotion",
      },
    ]);
  });
});

describe("a launch code left live", () => {
  const LAUNCH = { code: "DESERT15", offerIds: ["o1"], percentage: 15 };

  it("retries switching a fresh code off", async () => {
    let failures = 1;
    const call = vi.fn<ToolCall>((tool) => {
      if (tool === "ecommerce_deactivate-promotion" && failures > 0) {
        failures -= 1;
        return Promise.reject(new Error("socket hang up"));
      }
      return Promise.resolve(
        tool === "ecommerce_create-shop-promotion" ? { id: "prm_1" } : {}
      );
    });
    expect(await createInactivePromotion(call, LAUNCH)).toBe("prm_1");
    expect(
      call.mock.calls.filter(
        ([tool]) => tool === "ecommerce_deactivate-promotion"
      )
    ).toHaveLength(2);
  });

  it("says the code is live when it can't be switched off", async () => {
    const call = vi.fn<ToolCall>((tool) =>
      Promise.resolve(
        tool === "ecommerce_create-shop-promotion"
          ? { id: "prm_1" }
          : { bulkError: "Promotion is locked" }
      )
    );
    const failed = createInactivePromotion(call, LAUNCH);
    await expect(failed).rejects.toBeInstanceOf(PromotionLeftLiveError);
    await expect(failed).rejects.toThrow("is live");
    expect(
      call.mock.calls.filter(
        ([tool]) => tool === "ecommerce_deactivate-promotion"
      )
    ).toHaveLength(DEACTIVATE_ATTEMPTS);
  });

  it("finds a code an earlier attempt made", async () => {
    const { call } = fake({
      "ecommerce_get-promotions": {
        results: [
          { code: "OTHER", id: "prm_0" },
          { code: "DESERT15", id: "prm_1" },
        ],
      },
    });
    expect(await findPromotionByCode(call, "desert15")).toBe("prm_1");
    expect(await findPromotionByCode(call, "MISSING")).toBeUndefined();
  });
});

describe("orders", () => {
  it("summarizes orders without the customer's contact details", async () => {
    const { call } = fake({
      "ecommerce_get-orders": {
        results: [
          {
            amounts: { currency: "USD", orderTotal: 32.5, totalRefunded: 0 },
            customerEmail: "jane@example.com",
            friendlyId: "T4YTE8HA",
            id: "ord-1",
            items: [{ offerName: "Desert tee", quantity: 1, variantName: "M" }],
            status: "CONFIRMED",
          },
        ],
      },
    });
    const [order] = await listOrders(call, { page: 0 });
    expect(order).toEqual({
      createdAt: null,
      currency: "USD",
      friendlyId: "T4YTE8HA",
      fulfillmentStatus: null,
      id: "ord-1",
      items: [{ name: "Desert tee · M", quantity: 1 }],
      refundedCents: 0,
      status: "CONFIRMED",
      totalCents: 3250,
    });
    expect(JSON.stringify(order)).not.toContain("jane@");
  });

  it("previews a refund in major units and reads the card charge", async () => {
    const { call, calls } = fake({
      "ecommerce_preview-refund-cost": {
        chargeAmount: 2,
        fromBalance: 30.5,
      },
    });
    expect(
      await previewRefund(call, {
        amountCents: 3250,
        currency: "USD",
        orderId: "ord-1",
      })
    ).toEqual({
      chargeToCardCents: 200,
      fromBalanceCents: 3050,
      refundCents: undefined,
    });
    expect(calls[0]?.args).toEqual({
      amount: 32.5,
      currency: "USD",
      orderId: "ord-1",
    });
  });

  it("refuses to read a preview that lacks the amounts as free", async () => {
    const { call } = fake({ "ecommerce_preview-cancel-cost": { ok: true } });
    await expect(
      cancelOrder(call, { orderId: "ord-1", reason: "asked" })
    ).rejects.toThrow("cost preview");
  });
});

describe("per-size prices", () => {
  it("reads the size from Fourthwall's attribute string", () => {
    expect(sizeOf("Color: Red (#FF0000), Size: 2XL")).toBe("2XL");
    expect(sizeOf("Color: Black")).toBeUndefined();
  });

  it("adds the surcharge to larger sizes", () => {
    expect(sizePrices(30, { "2XL": 2, "3XL": 4, S: 0 })).toEqual([
      { price: 32, size: "2XL" },
      { price: 34, size: "3XL" },
    ]);
  });

  it("sets the base price, then only the surcharged sizes the offer has", async () => {
    const variants = {
      offers: [
        {
          id: "o1",
          variants: [
            { attributes: "Size: M", id: "v1", price: 30 },
            { attributes: "Size: 2XL", id: "v2", price: 30 },
          ],
        },
      ],
    };
    const call = vi.fn<ToolCall>((tool) =>
      Promise.resolve(tool === "ecommerce_get-offers-by-ids" ? variants : {})
    );
    await setSizePrices(call, "o1", 30, [
      { price: 32, size: "2XL" },
      { price: 34, size: "3XL" },
    ]);
    expect(call).toHaveBeenLastCalledWith(
      "ecommerce_bulk-update-offer-variant-prices",
      {
        groupBy: "SIZE",
        offerId: "o1",
        priceUpdates: [{ attributeValue: "2XL", price: 32 }],
      }
    );
    expect(await offerVariants(call, "o1")).toHaveLength(2);
  });
});

describe("launch discount guard", () => {
  it("bounds the base cost from a floor price", () => {
    const price = priceFor(12);
    expect(baseCostCeiling(price)).toBeGreaterThanOrEqual(12);
    expect(priceFor(baseCostCeiling(price))).toBeLessThanOrEqual(price);
  });

  it("allows a small launch discount and refuses one that loses money", () => {
    const price = priceFor(12);
    expect(discountKeepsProfit(price, 10)).toBe(true);
    expect(discountKeepsProfit(price, 60)).toBe(false);
  });
});

describe("promotions and gift cards", () => {
  it("lists shop codes once each and leaves memberships out", async () => {
    const { call, calls } = fake({
      "ecommerce_get-promotions": {
        results: [
          {
            code: "DUNE10",
            discount: { percentage: 10 },
            id: "prm_1",
            status: "LIVE",
            type: "SINGLE",
            usageCount: 3,
          },
          {
            codes: [{ code: "VIP1" }, { code: "VIP2" }],
            id: "prm_2",
            status: "ENDED",
            type: "MULTI",
          },
          {
            code: "FANS",
            id: "prm_3",
            status: "LIVE",
            type: "MEMBERSHIPS_SINGLE",
          },
        ],
      },
    });
    expect(await listPromotions(call, { page: 0 })).toEqual([
      { code: "DUNE10", id: "prm_1", percentage: 10, status: "LIVE", uses: 3 },
      {
        code: "VIP1",
        id: "prm_2",
        percentage: null,
        status: "ENDED",
        uses: null,
      },
    ]);
    expect(calls[0]?.args).toEqual({ page: 0, size: 10 });
  });

  it("lists gift cards with their balances in cents", async () => {
    const { call } = fake({
      "ecommerce_get-gift-cards": {
        results: [
          {
            balance: { initial: 25, remaining: 10.5 },
            code: "L3WQNU1MV4W9",
            expiresAt: null,
            id: "gc_1",
            status: "PARTIALLY_USED",
          },
        ],
      },
    });
    expect(await listGiftCards(call, { page: 0 })).toEqual([
      {
        code: "L3WQNU1MV4W9",
        expiresAt: null,
        id: "gc_1",
        initialCents: 2500,
        remainingCents: 1050,
        status: "PARTIALLY_USED",
      },
    ]);
  });

  it("creates gift cards in dollars, with an expiry only when given", async () => {
    const { call, calls } = fake({ "ecommerce_create-gift-cards": {} });
    await createGiftCards(call, { amountUsd: 50, count: 2 });
    expect(calls[0]?.args).toEqual({ amount: 50, numberOfCards: 2 });
  });
});
