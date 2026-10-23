import { createHash } from "node:crypto";

import {
  customerKeyOf,
  fourthwallEventKey,
  fourthwallEventSchema,
  fourthwallFields,
  metaChangeKey,
  metaChanges,
  metaWebhookSchema,
  pollEventKey,
  storedEventSchema,
} from "@wovain/shared/optimizer/events";
import type { FourthwallEvent } from "@wovain/shared/optimizer/events";
import { describe, expect, test } from "vitest";

const order = {
  amounts: { total: { currency: "USD", value: 42.5 } },
  billing: { address: { address1: "1 Main St", name: "Ada Buyer" } },
  createdAt: "2026-10-20T10:00:00Z",
  email: "Ada@Example.com",
  id: "ord_1",
  offers: [
    {
      id: "off_1",
      name: "Sakura Tee",
      variant: {
        attributes: { color: { name: "Black" }, size: { name: "M" } },
        id: "var_1",
        quantity: 2,
        unitPrice: { currency: "USD", value: 30 },
      },
    },
  ],
  shipping: { address: { name: "Ada Buyer" } },
  status: "CONFIRMED",
  trackingParams: { utm_content: "120200", utm_source: "meta" },
  username: "ada",
};

// A test secret; production reads OPTIMIZER_CUSTOMER_KEY.
const SECRET = "test-customer-key-0123456789abcdef";

const event = (type: string, data: unknown) =>
  fourthwallEventSchema.parse({
    data,
    id: "evt_1",
    shopId: "sh_1",
    testMode: false,
    type,
  });

const fieldsOf = (input: FourthwallEvent) => fourthwallFields(input, SECRET);

describe("fourthwallFields", () => {
  test("keeps what the rules read and drops names, emails and addresses", () => {
    const fields = fieldsOf(event("ORDER_PLACED", order));
    expect(fields).toEqual({
      currency: "USD",
      customerKey: customerKeyOf(SECRET, "sh_1", "ada@example.com"),
      items: [
        {
          color: "Black",
          offerId: "off_1",
          quantity: 2,
          size: "M",
          unitPrice: 30,
          variantId: "var_1",
        },
      ],
      kind: "order",
      orderId: "ord_1",
      placedAt: "2026-10-20T10:00:00Z",
      status: "CONFIRMED",
      total: 42.5,
      update: undefined,
      utm: { content: "120200", source: "meta" },
    });
    const stored = JSON.stringify(fields);
    for (const pii of ["Ada", "Main St", "example.com", "ada"]) {
      expect(stored).not.toContain(pii);
    }
  });

  test("reads an order update wrapped in { order, update }", () => {
    const fields = fieldsOf(
      event("ORDER_UPDATED", {
        order: { ...order, status: "SHIPPED" },
        update: { type: "STATUS" },
      })
    );
    expect(fields).toMatchObject({
      kind: "order",
      status: "SHIPPED",
      update: "STATUS",
    });
  });

  test("maps variant stock", () => {
    const fields = fieldsOf(
      event("PRODUCT_UPDATED", {
        product: {
          id: "p1",
          variants: [
            { id: "v1", stock: { inStock: 0, type: "LIMITED" } },
            { id: "v2", stock: { inStock: 4, type: "LIMITED" } },
            { id: "v3", stock: { type: "UNLIMITED" } },
          ],
        },
      })
    );
    expect(fields).toMatchObject({
      kind: "product",
      variants: [
        { stock: "out_of_stock" },
        { stock: "in_stock" },
        { stock: "unlimited" },
      ],
    });
  });

  test("covers promotions, carts and disconnects", () => {
    expect(
      fieldsOf(event("PROMOTION_STATUS_CHANGED", { id: "pr1", status: "LIVE" }))
    ).toEqual({ kind: "promotion", promotionId: "pr1", status: "LIVE" });
    expect(
      fieldsOf(
        event("CART_ABANDONED_24H", {
          cart: { items: [{ offer: { id: "off_1" }, quantity: 1 }] },
        })
      )
    ).toEqual({
      afterHours: 24,
      items: [{ offerId: "off_1", quantity: 1 }],
      kind: "cart",
    });
    expect(fieldsOf(event("PLATFORM_APP_DISCONNECTED", {}))).toEqual({
      kind: "disconnected",
    });
  });

  test("marks unknown types and payloads it can't read", () => {
    expect(fieldsOf(event("GIFT_PURCHASE", {}))).toEqual({
      kind: "unparsed",
    });
    expect(fieldsOf(event("ORDER_PLACED", { nope: 1 }))).toEqual({
      kind: "unparsed",
    });
  });
});

describe("idempotency keys", () => {
  test("one Fourthwall event id makes one key", () => {
    expect(fourthwallEventKey("evt_1")).toBe(fourthwallEventKey("evt_1"));
    expect(fourthwallEventKey("evt_1")).not.toBe(fourthwallEventKey("evt_2"));
    expect(fourthwallEventKey("a/b")).toMatch(/^fourthwall-[0-9a-f]{40}$/u);
  });

  test("a Meta change is keyed on account, field, object, value and time", () => {
    const change = {
      accountId: "1",
      field: "effective_status",
      objectId: "9",
      time: 100,
      value: { id: "9", status: "PAUSED" },
    };
    expect(metaChangeKey(change)).toBe(metaChangeKey({ ...change }));
    expect(metaChangeKey(change)).not.toBe(
      metaChangeKey({ ...change, time: 101 })
    );
    expect(metaChangeKey(change)).not.toBe(
      metaChangeKey({ ...change, value: { id: "9", status: "ACTIVE" } })
    );
  });

  test("poll keys depend on the version seen", () => {
    expect(pollEventKey("order", "o1", "v1")).not.toBe(
      pollEventKey("order", "o1", "v2")
    );
  });
});

describe("metaChanges", () => {
  test("flattens a batch, strips act_ and keys duplicates alike", () => {
    const body = metaWebhookSchema.parse({
      entry: [
        {
          changes: [
            { field: "effective_status", value: { id: 7, status: "ACTIVE" } },
            { field: "effective_status", value: { id: 7, status: "ACTIVE" } },
          ],
          id: "act_123",
          time: 5,
        },
        {
          changes: [{ field: "creative_fatigue", value: { ad_id: "8" } }],
          id: "456",
          time: 6,
        },
      ],
      object: "ad_account",
    });
    const changes = metaChanges(body);
    expect(changes.map((c) => [c.accountId, c.objectId])).toEqual([
      ["123", "7"],
      ["123", "7"],
      ["456", "8"],
    ]);
    expect(changes[0]?.key).toBe(changes[1]?.key);
    expect(changes[0]?.key).not.toBe(changes[2]?.key);
  });

  test("bounds a delivery at 1000 changes per entry", () => {
    const changes = Array.from({ length: 1001 }, () => ({
      field: "x",
      value: 1,
    }));
    expect(
      metaWebhookSchema.safeParse({
        entry: [{ changes, id: "1", time: 1 }],
        object: "ad_account",
      }).success
    ).toBe(false);
  });
});

test("a stored event parses with its defaults", () => {
  const stored = storedEventSchema.parse({
    fields: { kind: "disconnected" },
    key: fourthwallEventKey("evt_1"),
    receivedAt: 1,
    source: "fourthwall",
    type: "PLATFORM_APP_DISCONNECTED",
  });
  expect(stored.testMode).toBe(false);
  expect(stored.processedAt).toBeUndefined();
});

describe("customer keys", () => {
  test("are an HMAC with the server's secret, never a plain hash of the email", () => {
    const key = customerKeyOf(SECRET, "sh_1", "ada@example.com");
    const plain = createHash("sha256")
      .update("sh_1:ada@example.com")
      .digest("hex");
    expect(key).not.toBe(plain);
    expect(key).toBe(customerKeyOf(SECRET, "sh_1", " Ada@Example.com "));
    expect(key).not.toBe(
      customerKeyOf(`${SECRET}x`, "sh_1", "ada@example.com")
    );
    expect(key).not.toBe(customerKeyOf(SECRET, "sh_2", "ada@example.com"));
  });

  test("refuse an empty secret", () => {
    expect(() => customerKeyOf("", "sh_1", "ada@example.com")).toThrow();
    expect(() =>
      fourthwallFields(event("PLATFORM_APP_DISCONNECTED", {}), "")
    ).toThrow();
  });
});
