import { afterEach, beforeEach, expect, test } from "bun:test";

import { campaignResultSchema } from "@wovain/shared/campaign";
import { metaRules } from "@wovain/shared/rules";
import type { MetaRule } from "@wovain/shared/rules";
import { defaultSettings } from "@wovain/shared/settings";

import type { Store } from "../src/store.ts";
import {
  connectClient,
  demoDesign,
  restoreFetch,
  stubFetch,
  testStore,
} from "./helpers.ts";

let store: Store;
let graphCalls: { body: string; method: string; url: string }[] = [];

const connect = async (env: Record<string, string>) =>
  await connectClient(env, store);

beforeEach(async () => {
  graphCalls = [];
  stubFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    graphCalls.push({
      body: init?.body instanceof URLSearchParams ? init.body.toString() : "",
      method: init?.method ?? "GET",
      url,
    });
    if (init?.method === "POST") {
      return await Promise.resolve(
        Response.json({ id: String(graphCalls.length) })
      );
    }
    // One rule already exists, so create_rules must skip it.
    return await Promise.resolve(
      Response.json({ data: [{ id: "1", name: "wovain 555 · Alert" }] })
    );
  });
  store = await testStore();
  await store.saveDesign(demoDesign);
  await store.saveAd({
    coach: "Two clips.",
    designId: "d1",
    economics: {
      baseCost: 17.7,
      breakevenPerSale: 10.32,
      cardFees: 1.38,
      price: 30,
      refundReserve: 0.6,
      roas: 2.9,
      roasOnOrderValue: 3.6,
    },
    headline: "Sakura Season Cat Tee",
    primaryText: "A calico watches the sun go down.",
    productTitle: "Japanese Cat Sunset Tee",
    rules: {
      alertAbove: 10.32,
      killDesignAt: 41.28,
      killExpensiveAbove: 15.48,
      killNoSalesAt: 30.96,
      scaleStepPct: 20,
      scaleUnder: 8.26,
    },
    staticImage: { alt: "Black tee", url: "https://cdn.fourthwall.com/x.webp" },
    status: "added",
    videos: [
      {
        angle: "UGC on-model",
        seconds: 15,
        slot: "A",
        status: "ready",
        url: "https://v3b.fal.media/a.mp4",
      },
      {
        angle: "UGC styling",
        seconds: 15,
        slot: "B",
        status: "ready",
        url: "https://v3b.fal.media/b.mp4",
      },
    ],
  });
});

afterEach(() => {
  restoreFetch();
});

const filter = (rule: MetaRule | undefined, field: string) =>
  rule?.evaluation_spec.filters.find((f) => f.field === field)?.value;

test("the five rules carry the PRD thresholds in cents for the demo tee", () => {
  const rules = metaRules({
    campaignId: "555",
    dailyBudget: 15,
    products: [{ breakevenPerSale: 10.32, designId: "d1" }],
    rules: defaultSettings().rules,
  });
  expect(rules.map((rule) => rule.label)).toEqual([
    "Kill, no sales",
    "Kill, too expensive",
    "Kill, design",
    "Scale",
    "Alert",
  ]);
  const [noSales, expensive, designKill, scale, alert] = rules;
  expect(filter(noSales, "spent")).toBe(3096);
  expect(filter(noSales, "ad.name")).toBe("wovain d1 ·");
  expect(noSales?.schedule_spec.schedule_type).toBe("SEMI_HOURLY");
  expect(filter(expensive, "cost_per_purchase_fb")).toBe(1548);
  expect(filter(expensive, "offsite_conversion.fb_pixel_purchase")).toBe(4);
  expect(filter(designKill, "spent")).toBe(4128);
  expect(filter(scale, "cost_per_purchase_fb")).toBe(826);
  expect(scale?.execution_spec.execution_options).toContainEqual({
    field: "change_spec",
    operator: "EQUAL",
    value: { amount: 20, limit: 3000, unit: "PERCENTAGE" },
  });
  expect(alert?.execution_spec.execution_type).toBe("NOTIFICATION");
  expect(filter(alert, "campaign.id")).toEqual(["555"]);
});

test("the design kill is left to the check-in when a campaign holds two products", () => {
  const rules = metaRules({
    campaignId: "555",
    dailyBudget: 30,
    products: [
      { breakevenPerSale: 10.32, designId: "d1" },
      { breakevenPerSale: 12, designId: "d2" },
    ],
    rules: defaultSettings().rules,
  });
  expect(rules.filter((rule) => rule.label === "Kill, design")).toHaveLength(0);
  expect(rules).toHaveLength(6);
});

test("create_rules skips existing rules and records the campaign", async () => {
  const client = await connect({ META_SYSTEM_USER_TOKEN: "token" });
  const result = await client.callTool({
    arguments: { adAccountId: "act_42", campaignId: "555" },
    name: "create_rules",
  });
  expect(result.isError).toBeFalsy();
  const posts = graphCalls.filter((c) => c.method === "POST");
  expect(posts).toHaveLength(4);
  expect(posts[0]?.url).toBe(
    "https://graph.facebook.com/v26.0/act_42/adrules_library"
  );
  expect(posts.some((p) => p.body.includes("Alert"))).toBe(false);

  const card = await client.callTool({
    arguments: { status: "live" },
    name: "show_campaign_card",
  });
  const { campaign } = campaignResultSchema.parse(card.structuredContent);
  expect(campaign.dailyBudget).toBe(15);
  expect(campaign.products).toEqual([
    { ads: 2, designId: "d1", title: "Japanese Cat Sunset Tee" },
  ]);
  expect(campaign.rules.every((rule) => rule.created)).toBe(true);
  expect(campaign.adsManagerUrl).toContain("act=42&selected_campaign_ids=555");
  await client.close();
});

test("without a Meta token, create_rules creates nothing and says how to fix it", async () => {
  const client = await connect({});
  const result = await client.callTool({
    arguments: { adAccountId: "42", campaignId: "555" },
    name: "create_rules",
  });
  expect(JSON.stringify(result.content)).toContain("META_SYSTEM_USER_TOKEN");
  expect(graphCalls).toHaveLength(0);
  const plan = await client.callTool({ arguments: {}, name: "campaign_plan" });
  const text = JSON.stringify(plan.content);
  expect(text).toContain("1500");
  expect(text).toContain("wovain d1 · A");
  expect(text).toContain("utm_content={{ad.id}}");
  await client.close();
});

test("show_campaign_card refuses blocker links outside Meta", async () => {
  const client = await connect({});
  const result = await client.callTool({
    arguments: {
      blockers: [
        { fix: "Pay here.", issue: "Billing", url: "https://evil.example/pay" },
      ],
      status: "blocked",
    },
    name: "show_campaign_card",
  });
  expect(result.isError).toBe(true);
  await client.close();
});
