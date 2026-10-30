import { describe, expect, it } from "vitest";

import type { ShopFacts } from "./store";
import { evaluateSetup, pixelOnShop, readDomain } from "./store-setup";
import type { ToolCall } from "./upstream";

const READY: ShopFacts = {
  baseUrl: "https://atelier.fourthwall.com",
  enabledShippingProfiles: 1,
  hosts: ["atelier.fourthwall.com"],
  name: "Atelier",
  payoutStatus: "ACTIVE",
  shippingEnabled: true,
  siteStatus: "LIVE",
  verificationRestrictions: [],
};

const fake = (byTool: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = (tool, args) => {
    calls.push({ args, tool });
    return Promise.resolve(byTool[tool] ?? null);
  };
  return { call, calls };
};

const stateOf = (steps: ReturnType<typeof evaluateSetup>, id: string) =>
  steps.find((step) => step.id === id);

describe("evaluateSetup", () => {
  it("is done when the shop sells and the pixel fires on it", () => {
    const steps = evaluateSetup({
      domain: { domain: null, pendingRecords: 0, status: null },
      metaConnected: true,
      pixel: { datasetId: "939178269202011", firing: true },
      shop: READY,
    });
    expect(
      steps
        .filter((step) => step.required)
        .every((step) => step.state === "done")
    ).toBe(true);
    expect(stateOf(steps, "domain")?.state).toBe("check");
  });

  it("ticks the shop connected once the grant reads the shop", () => {
    const base = { domain: undefined, metaConnected: false, pixel: undefined };
    expect(
      stateOf(evaluateSetup({ ...base, shop: READY }), "connect")
    ).toMatchObject({
      how: "none",
      state: "done",
    });
    expect(
      stateOf(
        evaluateSetup({ ...base, shop: { ...READY, siteStatus: undefined } }),
        "connect"
      )
    ).toMatchObject({ how: "reconnect", state: "todo" });
  });

  it("takes the merchant's word for payouts support set up by hand", () => {
    const inactive = { ...READY, payoutStatus: "INACTIVE" };
    const base = {
      domain: undefined,
      metaConnected: false,
      pixel: undefined,
      shop: inactive,
    };
    expect(stateOf(evaluateSetup(base), "payouts")).toMatchObject({
      how: "link",
      state: "todo",
    });
    expect(
      stateOf(evaluateSetup({ ...base, confirmed: ["payouts"] }), "payouts")
    ).toMatchObject({ confirmedByMerchant: true, how: "none", state: "done" });
    // Stripe's own ACTIVE never needs the merchant's word.
    expect(
      stateOf(evaluateSetup({ ...base, shop: READY }), "payouts")
    ).not.toHaveProperty("confirmedByMerchant");
  });

  it("offers going live, links payouts and shipping, and waits on Meta", () => {
    const steps = evaluateSetup({
      domain: undefined,
      metaConnected: false,
      pixel: undefined,
      shop: {
        ...READY,
        enabledShippingProfiles: 0,
        payoutStatus: "IN_PROGRESS",
        siteStatus: "COMING_SOON",
      },
    });
    expect(stateOf(steps, "site_live")).toMatchObject({
      how: "do_it",
      state: "todo",
    });
    expect(stateOf(steps, "payouts")).toMatchObject({ how: "link" });
    expect(stateOf(steps, "shipping")).toMatchObject({ how: "link" });
    expect(stateOf(steps, "pixel")).toMatchObject({
      how: "connect_meta",
      state: "waiting",
    });
  });

  it("waits on Fourthwall's review instead of offering to go live", () => {
    const steps = evaluateSetup({
      domain: undefined,
      metaConnected: true,
      pixel: { datasetId: "1", firing: false },
      shop: {
        ...READY,
        siteStatus: "COMING_SOON",
        verificationRestrictions: ["storefront_noindex"],
      },
    });
    expect(stateOf(steps, "site_live")?.state).toBe("waiting");
    expect(stateOf(steps, "pixel")).toMatchObject({
      how: "link",
      state: "todo",
    });
  });
});

describe("pixelOnShop", () => {
  it("fires when the dataset saw events from the shop's host", async () => {
    const { call, calls } = fake({
      ads_get_dataset_stats: {
        data: [
          { count: 3, value: "www.atelier.fourthwall.com" },
          { count: 9, value: "other.example" },
        ],
      },
    });
    expect(
      await pixelOnShop(call, {
        datasetId: "939178269202011",
        hosts: ["atelier.fourthwall.com"],
        now: new Date("2026-10-29T00:00:00Z"),
      })
    ).toEqual({ datasetId: "939178269202011", firing: true });
    expect(calls[0]?.args).toMatchObject({
      aggregation: "host",
      dataset_id: "939178269202011",
      end_time: "1793232000",
      start_time: "1792627200",
    });
  });

  it("doesn't fire on another site's events", async () => {
    const { call } = fake({
      ads_get_dataset_stats: { data: [{ count: 9, value: "other.example" }] },
    });
    const seen = await pixelOnShop(call, {
      datasetId: "1",
      hosts: ["atelier.fourthwall.com"],
    });
    expect(seen.firing).toBe(false);
  });
});

describe("readDomain", () => {
  it("reads no custom domain as the Fourthwall address", async () => {
    const { call } = fake({ "ecommerce_get-dns-entries": null });
    expect(await readDomain(call)).toEqual({
      domain: null,
      pendingRecords: 0,
      status: null,
    });
  });

  it("counts the records Fourthwall hasn't verified", async () => {
    const { call } = fake({
      "ecommerce_get-dns-entries": {
        domain: "atelier.shop",
        records: [
          { status: "VALID" },
          { status: "INVALID" },
          { status: "UNKNOWN" },
        ],
        status: "NOT_CONNECTED",
      },
    });
    expect(await readDomain(call)).toEqual({
      domain: "atelier.shop",
      pendingRecords: 2,
      status: "NOT_CONNECTED",
    });
  });
});
