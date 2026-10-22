import { createHmac } from "node:crypto";

import {
  campaignResultSchema,
  launchApprovalSchema,
} from "@wovain/shared/campaign";
import { metaRules } from "@wovain/shared/rules";
import type { MetaRule } from "@wovain/shared/rules";
import { defaultSettings } from "@wovain/shared/settings";
import { afterEach, beforeEach, expect, test } from "vitest";
import { z } from "zod";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import type { Store } from "../../src/store.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
import {
  connectClient,
  demoDesign,
  restoreFetch,
  stubFetch,
  testStorage,
  testStore,
} from "../helpers.ts";

let store: Store;
let graphCalls: {
  authorization: string;
  body: string;
  method: string;
  url: string;
}[] = [];

const connect = async (env: Record<string, string>) =>
  await connectClient(env, store);

beforeEach(async () => {
  graphCalls = [];
  stubFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    graphCalls.push({
      authorization: new Headers(init?.headers).get("authorization") ?? "",
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
  store = testStore();
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

test("turning off alertAboveBreakeven creates no Alert rule", async () => {
  const rules = metaRules({
    campaignId: "555",
    dailyBudget: 15,
    products: [{ breakevenPerSale: 10.32, designId: "d1" }],
    rules: { ...defaultSettings().rules, alertAboveBreakeven: false },
  });
  expect(rules.map((rule) => rule.label)).not.toContain("Alert");

  await store.updateSettings({ rules: { alertAboveBreakeven: false } });
  const client = await connect({});
  const widget = await client.callTool({
    arguments: { status: "ready" },
    name: "show_campaign_widget",
  });
  const { campaign } = campaignResultSchema.parse(widget.structuredContent);
  expect(campaign.rules.map((rule) => rule.label)).not.toContain("Alert");
  await client.close();
});

test("turning off tagUtmContent leaves the URL tags out of the plan", async () => {
  await store.updateSettings({ rules: { tagUtmContent: false } });
  const client = await connect({});
  const plan = await client.callTool({ arguments: {}, name: "campaign_plan" });
  expect(JSON.stringify(plan.content)).not.toContain("utm_");
  await client.close();
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

// wovain's client on a fake Meta with wovain's Meta app configured, and the
// merchant ("test") connected unless `connected` is false.
const connectedMeta = async (connected = true) => {
  const fake = fakeUpstream("meta");
  const upstream = createUpstream({
    clients: { meta: { client_id: "1234567890" } },
    connections: createConnections(testStorage().db, localCipher()),
    fetch: fake.fetch,
    site: "https://wovain.test",
  });
  if (connected) {
    await connectWith(upstream, fake, "test", "meta");
  }
  const client = await connectClient({ META_APP_SECRET: "app-secret" }, store, {
    upstream,
  });
  return { client, fake };
};

const conversation = "AbCdEfGhIj0123456789";

test("create_rules uses the merchant's own Meta token, skips existing rules and records the campaign", async () => {
  const { client } = await connectedMeta();
  const result = await client.callTool({
    arguments: { adAccountId: "act_42", campaignId: "555" },
    name: "create_rules",
  });
  expect(result.isError).toBeFalsy();
  const posts = graphCalls.filter((c) => c.method === "POST");
  expect(posts).toHaveLength(4);
  const url = new URL(posts[0]?.url ?? "");
  expect(url.origin + url.pathname).toBe(
    "https://graph.facebook.com/v26.0/act_42/adrules_library"
  );
  const token = posts[0]?.authorization.replace(/^Bearer /u, "") ?? "";
  expect(token).toMatch(/^at-/u);
  expect(url.searchParams.get("appsecret_proof")).toBe(
    createHmac("sha256", "app-secret").update(token).digest("hex")
  );
  expect(posts.some((p) => p.body.includes("Alert"))).toBe(false);

  const widget = await client.callTool({
    arguments: { status: "live" },
    name: "show_campaign_widget",
  });
  const { campaign } = campaignResultSchema.parse(widget.structuredContent);
  expect(campaign.dailyBudget).toBe(15);
  expect(campaign.products).toEqual([
    { ads: 2, designId: "d1", title: "Japanese Cat Sunset Tee" },
  ]);
  expect(campaign.rules.every((rule) => rule.created)).toBe(true);
  expect(campaign.adsManagerUrl).toContain("act=42&selected_campaign_ids=555");
  await client.close();
});

test("before the merchant connects Meta, create_rules gives the connect link", async () => {
  const { client } = await connectedMeta(false);
  const result = await client.callTool({
    arguments: { adAccountId: "42", campaignId: "555" },
    name: "create_rules",
  });
  expect(result.structuredContent).toMatchObject({ needsConnection: "meta" });
  expect(graphCalls).toHaveLength(0);
  await client.close();
});

test("without wovain's Meta app, create_rules creates nothing and the plan still works", async () => {
  const client = await connect({});
  const result = await client.callTool({
    arguments: { adAccountId: "42", campaignId: "555" },
    name: "create_rules",
  });
  expect(result.structuredContent).toEqual({ configured: false });
  expect(graphCalls).toHaveLength(0);
  const plan = await client.callTool({ arguments: {}, name: "campaign_plan" });
  const text = JSON.stringify(plan.content);
  expect(text).toContain("1500");
  expect(text).toContain("wovain d1 · A");
  expect(text).toContain("utm_content={{ad.id}}");
  await client.close();
});

const campaignArgs = {
  ad_account_id: "42",
  buying_type: "AUCTION",
  campaign_daily_budget: 999_999,
  campaign_name: "wovain",
  client_conversation_id: conversation,
  objective: "OUTCOME_SALES",
};

test("campaign_draft sends only allowlisted arguments, with the plan's budget", async () => {
  const { client, fake } = await connectedMeta();
  await client.callTool({
    arguments: { arguments: campaignArgs, tool: "ads_create_campaign" },
    name: "campaign_draft",
  });
  await client.callTool({
    arguments: {
      arguments: {
        ad_account_id: "42",
        ad_set_name: "wovain",
        billing_event: "IMPRESSIONS",
        campaign_id: "555",
        client_conversation_id: conversation,
        destination_type: "WEBSITE",
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { custom_event_type: "PURCHASE", pixel_id: "9" },
        targeting: '{"geo_locations":{"countries":["US"]}}',
      },
      tool: "ads_create_ad_set",
    },
    name: "campaign_draft",
  });
  expect(fake.calls).toEqual([
    {
      arguments: {
        ...campaignArgs,
        advertiser_job: "create_and_launch_new_ads",
        campaign_daily_budget: 1500,
        hide_ui: true,
      },
      name: "ads_create_campaign",
    },
    {
      arguments: {
        ad_account_id: "42",
        ad_set_name: "wovain",
        advertiser_job: "create_and_launch_new_ads",
        billing_event: "IMPRESSIONS",
        campaign_id: "555",
        client_conversation_id: conversation,
        destination_type: "WEBSITE",
        hide_ui: true,
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: '{"custom_event_type":"PURCHASE","pixel_id":"9"}',
        targeting: '{"geo_locations":{"countries":["US"]}}',
      },
      name: "ads_create_ad_set",
    },
  ]);
  await client.close();
});

test.each([
  ["a lifetime budget", { campaign_lifetime_budget: 5 }],
  ["a spend cap", { campaign_spend_cap: 5 }],
  ["a status", { status: "ACTIVE" }],
])("campaign_draft refuses %s", async (_label, extra) => {
  const { client, fake } = await connectedMeta();
  const result = await client.callTool({
    arguments: {
      arguments: { ...campaignArgs, ...extra },
      tool: "ads_create_campaign",
    },
    name: "campaign_draft",
  });
  expect(result.isError).toBe(true);
  expect(fake.calls).toEqual([]);
  await client.close();
});

test("campaign_draft refuses an ad set budget and nested extras", async () => {
  const { client, fake } = await connectedMeta();
  const adSet = {
    ad_account_id: "42",
    ad_set_name: "wovain",
    billing_event: "IMPRESSIONS",
    campaign_id: "555",
    client_conversation_id: conversation,
    destination_type: "WEBSITE",
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: { custom_event_type: "PURCHASE", pixel_id: "9" },
    targeting: { geo_locations: { countries: ["US"] } },
  };
  for (const args of [
    { ...adSet, daily_budget: 100_000 },
    { ...adSet, targeting: { ...adSet.targeting, age_max: 30 } },
  ]) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await client.callTool({
      arguments: { arguments: args, tool: "ads_create_ad_set" },
      name: "campaign_draft",
    });
    expect(result.isError).toBe(true);
  }
  expect(fake.calls).toEqual([]);
  await client.close();
});

test("meta_ads refuses tools that publish or spend", async () => {
  const { client, fake } = await connectedMeta();
  const result = await client.callTool({
    arguments: { arguments: {}, tool: "ads_activate_entity" },
    name: "meta_ads",
  });
  expect(result.isError).toBe(true);
  expect(fake.calls).toEqual([]);
  await client.close();
});

// A merchant with Meta connected, the campaign recorded by create_rules,
// and a draft of one ad set and two ads under it.
const recorded = async () => {
  const env = await connectedMeta();
  await env.client.callTool({
    arguments: { adAccountId: "act_42", campaignId: "555" },
    name: "create_rules",
  });
  env.fake.reply("ads_get_ad_entities", {
    data: [
      { ad_object_id: "555", level: "campaign" },
      { ad_object_id: "666", level: "ad_set" },
      { ad_object_id: "777", level: "ad" },
      { ad_object_id: 778, level: "ad" },
    ],
  });
  const approve = async (campaignId = "555") =>
    await env.client.callTool({
      arguments: { campaignId },
      name: "approve_launch",
    });
  const launch = async (launchToken: unknown, objectIds?: string[]) =>
    await env.client.callTool({
      arguments: { launchToken, ...(objectIds && { objectIds }) },
      name: "launch_campaign",
    });
  const tokenOf = (result: Awaited<ReturnType<typeof approve>>) =>
    launchApprovalSchema.parse(result.structuredContent).launchToken;
  const activations = () =>
    env.fake.calls.filter((call) => call.name === "ads_activate_entity");
  return { ...env, activations, approve, launch, tokenOf };
};

test("only the widget sees approve_launch and launch_campaign", async () => {
  const { client } = await connectedMeta();
  const { tools } = await client.listTools();
  for (const name of ["approve_launch", "launch_campaign"]) {
    expect(tools.find((tool) => tool.name === name)?._meta).toMatchObject({
      ui: { visibility: ["app"] },
    });
  }
  await client.close();
});

test("a Launch press publishes the recorded campaign and its draft", async () => {
  const { activations, approve, client, launch, tokenOf } = await recorded();
  const result = await launch(tokenOf(await approve()));
  expect(result.isError).toBeFalsy();
  const [activation] = activations();
  const { client_conversation_id: conversationId, ...args } = z
    .record(z.string(), z.unknown())
    .parse(activation?.arguments);
  expect(conversationId).toMatch(/^[A-Za-z\d]{20}$/u);
  expect(args).toEqual({
    ad_account_id: "42",
    advertiser_job: "create_and_launch_new_ads",
    entity_id: "555",
    entity_type: "campaign",
    hide_ui: true,
    object_ids: ["555", "666", "777", "778"],
    publish_as_active: true,
  });
  expect(activations()).toHaveLength(1);
  await client.close();
});

test("launch_campaign refuses without a launch ticket", async () => {
  const { activations, client, launch } = await recorded();
  const result = await launch("not-a-ticket");
  expect(result.isError).toBe(true);
  expect(activations()).toEqual([]);
  await client.close();
});

test("a launch ticket works once", async () => {
  const { activations, approve, client, launch, tokenOf } = await recorded();
  const token = tokenOf(await approve());
  await launch(token);
  const again = await launch(token);
  expect(again.isError).toBe(true);
  expect(activations()).toHaveLength(1);
  await client.close();
});

test("launch_campaign refuses objects outside the recorded campaign's draft", async () => {
  const { activations, approve, client, launch, tokenOf } = await recorded();
  const result = await launch(tokenOf(await approve()), ["777", "999"]);
  expect(result.isError).toBe(true);
  expect(activations()).toEqual([]);
  await client.close();
});

test("approve_launch only approves the recorded campaign", async () => {
  const { approve, client } = await recorded();
  const result = await approve("12345");
  expect(result.isError).toBe(true);
  await client.close();
});

test("show_campaign_widget refuses blocker links outside Meta", async () => {
  const client = await connect({});
  const result = await client.callTool({
    arguments: {
      blockers: [
        { fix: "Pay here.", issue: "Billing", url: "https://evil.example/pay" },
      ],
      status: "blocked",
    },
    name: "show_campaign_widget",
  });
  expect(result.isError).toBe(true);
  await client.close();
});
