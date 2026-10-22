import { createHmac } from "node:crypto";

import type { Ad, ConceptRevision } from "@wovain/shared/ad";
import {
  campaignResultSchema,
  launchRequestSchema,
} from "@wovain/shared/campaign";
import { metaRules } from "@wovain/shared/rules";
import type { MetaRule } from "@wovain/shared/rules";
import { defaultSettings } from "@wovain/shared/settings";
import { afterEach, beforeEach, expect, test } from "vitest";
import { z } from "zod";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createStagedObjects } from "../../src/lib/meta-staged.ts";
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

type AdFixture = Omit<Ad, "concepts" | "status"> & {
  concepts: ConceptRevision[];
};

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
  await store.saveDesign({
    ...demoDesign,
    productUrl: "https://shop.example/products/cat-tee",
  });
  const { concepts, ...ad }: AdFixture = {
    coach: "Two clips.",
    concepts: [
      {
        angle: "UGC try-on",
        assets: [
          {
            alt: "Try-on clip",
            kind: "video",
            ratio: "9:16",
            source: "fal",
            status: "ready",
            url: "https://v3b.fal.media/a.mp4",
          },
          {
            alt: "Black tee",
            kind: "image",
            ratio: "1:1",
            source: "fourthwall",
            status: "ready",
            url: "https://cdn.fourthwall.com/x.webp",
          },
        ],
        audience: "Cat people",
        cta: "SHOP_NOW",
        headlines: ["Sakura Season Cat Tee", "The cat tee for spring"],
        hook: "A calico watches the sun go down.",
        id: "c1",
        name: "Try-on",
        primaryTexts: ["A calico watches the sun go down."],
      },
      {
        angle: "Gift",
        assets: [
          {
            alt: "Black tee",
            kind: "image",
            ratio: "1:1",
            source: "fourthwall",
            status: "ready",
            url: "https://cdn.fourthwall.com/x.webp",
          },
        ],
        audience: "Gift buyers",
        cta: "SHOP_NOW",
        headlines: ["A gift for cat people"],
        hook: "For the friend whose cat runs the house.",
        id: "c2",
        name: "Gift",
        primaryTexts: ["For the friend whose cat runs the house."],
      },
    ],
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
  };
  await store.saveConcepts(ad, concepts);
  await store.recordConcept("d1", "c1", "approved");
  await store.recordConcept("d1", "c2", "skipped");
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

const conversation = "AbCdEfGhIj0123456789";
const productUrl = "https://shop.example/products/cat-tee";
const imageHash = "0123456789abcdef0123456789abcdef";
const taggedLink = `${productUrl}?utm_source=meta&utm_medium=paid&utm_campaign=wovain&utm_content={{ad.id}}`;

// wovain's client on a fake Meta with wovain's Meta app configured, and the
// merchant ("test") connected unless `connected` is false. Meta answers each
// create with the object's ID: campaign 555, ad set 666, video 8 (and the
// image hash), creative 901, ad 777.
const connectedMeta = async (connected = true) => {
  const fake = fakeUpstream("meta");
  fake.reply("ads_create_campaign", { campaign_id: "555", status: "DRAFT" });
  fake.reply("ads_create_ad_set", { ad_set_id: "666", status: "DRAFT" });
  fake.reply("ads_creative_upload_media", {
    image_hash: imageHash,
    video_id: "8",
  });
  fake.reply("ads_create_creative", { creative_id: "901" });
  fake.reply("ads_create_ad", { ad_id: "777", status: "DRAFT" });
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
  const draft = async (tool: string, args: Record<string, unknown>) =>
    await client.callTool({
      arguments: { arguments: args, tool },
      name: "campaign_draft",
    });
  return { client, draft, fake, upstream };
};

const base = { ad_account_id: "42", client_conversation_id: conversation };
const campaignArgs = {
  ...base,
  buying_type: "AUCTION",
  campaign_daily_budget: 999_999,
  campaign_name: "wovain",
  objective: "OUTCOME_SALES",
};
const adSetArgs = {
  ...base,
  ad_set_name: "wovain",
  billing_event: "IMPRESSIONS",
  campaign_id: "555",
  destination_type: "WEBSITE",
  optimization_goal: "OFFSITE_CONVERSIONS",
  promoted_object: { custom_event_type: "PURCHASE", pixel_id: "9" },
  targeting: '{"geo_locations":{"countries":["US"]}}',
};
const videoArgs = {
  ...base,
  media_type: "VIDEO",
  media_url: "https://v3b.fal.media/a.mp4",
};
const imageArgs = {
  ...base,
  media_type: "IMAGE",
  media_url: "https://cdn.fourthwall.com/x.webp",
};
const creativeArgs = {
  ...base,
  call_to_action_type: "SHOP_NOW",
  image_hash: imageHash,
  link_url: taggedLink,
  message: "Sakura Season Cat Tee\nA calico watches the sun go down.",
  page_id: "7",
  self_ai_disclosure: "OPT_IN",
  video_id: "8",
};
const adArgs = {
  ...base,
  ad_name: "wovain d1 · A",
  ad_set_id: "666",
  creative: { creative_id: "901" },
};

// A merchant with Meta connected, campaign 555, ad set 666 and both
// uploads staged; with `full`, also creative 901 and ad 777.
const staged = async (
  full = false,
  creative: Record<string, unknown> = creativeArgs,
  uploads: Record<string, unknown>[] = [videoArgs, imageArgs]
) => {
  const env = await connectedMeta();
  const steps: [string, Record<string, unknown>][] = [
    ["ads_create_campaign", campaignArgs],
    ["ads_create_ad_set", adSetArgs],
    ...uploads.map((upload): [string, Record<string, unknown>] => [
      "ads_creative_upload_media",
      upload,
    ]),
    ...(full
      ? ([
          ["ads_create_creative", creative],
          ["ads_create_ad", adArgs],
        ] as [string, Record<string, unknown>][])
      : []),
  ];
  for (const [tool, args] of steps) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await env.draft(tool, args);
    expect(result.isError).toBeFalsy();
  }
  return env;
};

test("campaign_draft records what Meta staged and sends only allowlisted arguments", async () => {
  const { client, fake } = await staged(true);
  await expect(store.getCampaign()).resolves.toEqual({
    adAccountId: "42",
    campaignId: "555",
    rulesCreated: [],
  });
  expect(fake.calls.slice(0, 2)).toEqual([
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
        ...adSetArgs,
        advertiser_job: "create_and_launch_new_ads",
        hide_ui: true,
        promoted_object: '{"custom_event_type":"PURCHASE","pixel_id":"9"}',
      },
      name: "ads_create_ad_set",
    },
  ]);
  expect(fake.calls.at(-1)).toEqual({
    arguments: {
      ...adArgs,
      advertiser_job: "create_and_launch_new_ads",
      creative: '{"creative_id":"901"}',
      hide_ui: true,
    },
    name: "ads_create_ad",
  });
  await client.close();
});

const refusals = [
  [
    "a lifetime budget",
    "ads_create_campaign",
    campaignArgs,
    { campaign_lifetime_budget: 5 },
  ],
  [
    "a spend cap",
    "ads_create_campaign",
    campaignArgs,
    { campaign_spend_cap: 5 },
  ],
  ["a status", "ads_create_campaign", campaignArgs, { status: "ACTIVE" }],
  [
    "an ad set budget",
    "ads_create_ad_set",
    adSetArgs,
    { daily_budget: 100_000 },
  ],
  [
    "a nested targeting extra",
    "ads_create_ad_set",
    adSetArgs,
    { targeting: { age_max: 30, geo_locations: { countries: ["US"] } } },
  ],
  [
    "an ad set under another campaign",
    "ads_create_ad_set",
    adSetArgs,
    { campaign_id: "999" },
  ],
  [
    "a link that isn't an added product",
    "ads_create_creative",
    creativeArgs,
    { link_url: "https://evil.example/cat-tee" },
  ],
  [
    "a video wovain didn't upload",
    "ads_create_creative",
    creativeArgs,
    { video_id: "99" },
  ],
  [
    "a thumbnail wovain didn't upload",
    "ads_create_creative",
    creativeArgs,
    { image_hash: "ffffffffffffffffffffffffffffffff" },
  ],
  [
    "an upload that isn't an added ad's media",
    "ads_creative_upload_media",
    videoArgs,
    { media_url: "https://evil.example/a.mp4" },
  ],
  [
    "an ad in an ad set wovain didn't stage",
    "ads_create_ad",
    adArgs,
    { ad_set_id: "999" },
  ],
  [
    "an ad with a creative wovain didn't make",
    "ads_create_ad",
    adArgs,
    { creative: { creative_id: "999" } },
  ],
] as const;

test.each(refusals)(
  "campaign_draft refuses %s",
  async (_label, tool, args, extra) => {
    const env = await staged(tool === "ads_create_ad");
    const before = env.fake.calls.length;
    const result = await env.draft(tool, { ...args, ...extra });
    expect(result.isError).toBe(true);
    expect(env.fake.calls).toHaveLength(before);
    await env.client.close();
  }
);

test("create_rules uses the merchant's own Meta token, skips existing rules and marks them", async () => {
  const { client } = await staged();
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
  expect(campaign.launchVia).toBe("wovain");
  expect(campaign.products).toEqual([
    { ads: 1, designId: "d1", title: "Japanese Cat Sunset Tee" },
  ]);
  expect(campaign.rules.every((rule) => rule.created)).toBe(true);
  expect(campaign.adsManagerUrl).toContain("act=42&selected_campaign_ids=555");
  await client.close();
});

test("create_rules refuses a campaign wovain didn't stage", async () => {
  const { client } = await staged();
  for (const args of [
    { adAccountId: "42", campaignId: "777" },
    { adAccountId: "43", campaignId: "555" },
  ]) {
    // oxlint-disable-next-line no-await-in-loop
    const result = await client.callTool({
      arguments: args,
      name: "create_rules",
    });
    expect(result.isError).toBe(true);
  }
  expect(graphCalls).toHaveLength(0);
  await client.close();
});

test("before the merchant connects Meta, campaign_draft gives the connect link", async () => {
  const { client, draft, fake } = await connectedMeta(false);
  const result = await draft("ads_create_campaign", campaignArgs);
  expect(result.structuredContent).toMatchObject({ needsConnection: "meta" });
  expect(fake.calls).toEqual([]);
  await expect(store.getCampaign()).resolves.toBeUndefined();
  await client.close();
});

test("without wovain's Meta app, campaign_draft says so and the plan still works", async () => {
  const client = await connect({});
  const result = await client.callTool({
    arguments: { arguments: campaignArgs, tool: "ads_create_campaign" },
    name: "campaign_draft",
  });
  expect(result.structuredContent).toEqual({ configured: false });
  const plan = await client.callTool({ arguments: {}, name: "campaign_plan" });
  const text = JSON.stringify(plan.content);
  expect(text).toContain("1500");
  expect(text).toContain("wovain d1 · c1");
  expect(text).not.toContain("wovain d1 · c2");
  expect(text).toMatch(/aiMade\\+":true/u);
  expect(text).toContain("utm_content={{ad.id}}");
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

// What Meta reads back: the staged draft and creative, matching what wovain
// staged unless the overrides change them.
interface ReadBack {
  ad?: Record<string, unknown>;
  adSet?: Record<string, unknown>;
  campaign?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  // Replaces the whole read-back creative (the other shapes).
  creativeEntity?: Record<string, unknown>;
  extra?: Record<string, unknown>[];
  withoutAd?: boolean;
}
const readBack = (fake: ReturnType<typeof fakeUpstream>, over: ReadBack) => {
  fake.reply("ads_get_ad_entities", {
    ad_drafts: [
      {
        ad_object_id: "555",
        daily_budget: "1500",
        objective: "OUTCOME_SALES",
        ...over.campaign,
      },
      {
        ad_object_id: "666",
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { custom_event_type: "PURCHASE", pixel_id: "9" },
        targeting: { geo_locations: { countries: ["US"] } },
        ...over.adSet,
      },
      ...(over.withoutAd === true
        ? []
        : [
            {
              ad_object_id: "777",
              adset_id: "666",
              campaign_id: "555",
              creative_id: "901",
              ...over.ad,
            },
          ]),
      ...(over.extra ?? []),
    ],
  });
  fake.reply("ads_get_creatives", {
    data: [
      over.creativeEntity ?? {
        call_to_action_type: "SHOP_NOW",
        id: "901",
        image_hash: imageHash,
        link_url: taggedLink,
        object_story_id: "7_100",
        video_id: "8",
        ...over.creative,
      },
    ],
  });
};

// A fully staged campaign, Meta's read-back, and the merchant's confirmation
// through the confirm page's own steps (prepare shows the page, confirm is
// the POST).
const launchable = async (
  over: ReadBack = {},
  creative: Record<string, unknown> = creativeArgs,
  uploads?: Record<string, unknown>[]
) => {
  const env = await staged(true, creative, uploads);
  readBack(env.fake, over);
  const confirmByMerchant = async () => {
    const request = await env.client.callTool({
      arguments: {},
      name: "request_launch",
    });
    const { confirmUrl } = launchRequestSchema.parse(request.structuredContent);
    const id = confirmUrl.split("/").at(-1) ?? "";
    const hashes = { confirmHash: "cookie-hash", csrfHash: "csrf-hash" };
    await env.upstream.launches.prepare(id, "test", hashes);
    return await env.upstream.launches.confirm(
      id,
      hashes.confirmHash,
      hashes.csrfHash
    );
  };
  const launch = async () =>
    await env.client.callTool({ arguments: {}, name: "launch_campaign" });
  const activations = () =>
    env.fake.calls.filter((call) => call.name === "ads_activate_entity");
  return { ...env, activations, confirmByMerchant, launch };
};

test("the model alone can't launch: request_launch only makes the confirm link", async () => {
  const { activations, client, launch } = await launchable();
  const request = await client.callTool({
    arguments: {},
    name: "request_launch",
  });
  const { confirmUrl } = launchRequestSchema.parse(request.structuredContent);
  expect(confirmUrl).toMatch(/^https:\/\/wovain\.test\/confirm\/launch\//u);
  expect(JSON.stringify(request)).not.toMatch(/token|csrf/iu);
  const result = await launch();
  expect(result.isError).toBe(true);
  expect(activations()).toEqual([]);
  await client.close();
});

test("a confirmed launch publishes only what wovain staged, once", async () => {
  const { activations, client, confirmByMerchant, launch } = await launchable();
  await expect(confirmByMerchant()).resolves.toBe(true);
  const result = await launch();
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
    object_ids: ["555", "666", "777"],
    publish_as_active: true,
  });
  const again = await launch();
  expect(again.isError).toBe(true);
  expect(activations()).toHaveLength(1);
  await client.close();
});

test.each<[string, ReadBack]>([
  ["an object wovain didn't stage", { extra: [{ ad_object_id: "999" }] }],
  ["a recorded ad missing", { withoutAd: true }],
  ["a budget that isn't the plan's", { campaign: { daily_budget: "999999" } }],
  ["another objective", { campaign: { objective: "OUTCOME_TRAFFIC" } }],
  ["a spend cap", { campaign: { spend_cap: "100000" } }],
  [
    "other ad set targeting",
    { adSet: { targeting: { geo_locations: { countries: ["CA"] } } } },
  ],
  ["an ad set bid strategy", { adSet: { bid_strategy: "COST_CAP" } }],
  [
    "extra ad set targeting",
    {
      adSet: {
        targeting: { age_max: 30, geo_locations: { countries: ["US"] } },
      },
    },
  ],
  [
    "another promoted object",
    {
      adSet: { promoted_object: { custom_event_type: "LEAD", pixel_id: "9" } },
    },
  ],
  ["another optimization goal", { adSet: { optimization_goal: "REACH" } }],
  ["an ad on another creative", { ad: { creative_id: "999" } }],
  ["an ad in another ad set", { ad: { adset_id: "999" } }],
  [
    "a changed creative link",
    { creative: { link_url: "https://evil.example" } },
  ],
  ["a changed creative video", { creative: { video_id: "99" } }],
  ["a changed creative Page", { creative: { object_story_id: "70_100" } }],
  ["a changed creative CTA", { creative: { call_to_action_type: "SIGN_UP" } }],
  ["a creative without its CTA", { creative: { call_to_action_type: null } }],
])("launch_campaign stops when the read-back has %s", async (_label, over) => {
  const { activations, client, confirmByMerchant, launch } =
    await launchable(over);
  await confirmByMerchant();
  const result = await launch();
  expect(result.isError).toBe(true);
  expect(activations()).toEqual([]);
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

test("asking for the launch freezes the draft", async () => {
  const { client, draft, fake } = await launchable();
  await client.callTool({ arguments: {}, name: "request_launch" });
  const before = fake.calls.length;
  const result = await draft("ads_create_ad", adArgs);
  expect(result.isError).toBe(true);
  expect(fake.calls).toHaveLength(before);
  await client.close();
});

test("a draft that changed after the merchant confirmed isn't launched", async () => {
  const env = await launchable();
  await expect(env.confirmByMerchant()).resolves.toBe(true);
  // Something added to the record behind the frozen draft's back.
  await env.upstream.staged.record(
    "test",
    "ads_create_ad",
    { ...adArgs, creative: '{"creative_id":"901"}' },
    { ad_id: "778" }
  );
  const result = await env.launch();
  expect(result.isError).toBe(true);
  expect(env.activations()).toEqual([]);
  await env.client.close();
});

// The other creative shapes an approved concept becomes: one image, a
// multi-media pool, and a carousel across d1 and d2 (a live mug).
const mugUrl = "https://shop.example/products/cat-mug";
const mugImage = "https://cdn.fourthwall.com/mug.webp";
const taggedMug = taggedLink.replace(productUrl, mugUrl);
const foreignHash = "ffffffffffffffffffffffffffffffff";
const mugUpload = { ...imageArgs, media_url: mugImage };
const shapeBase = {
  ...base,
  call_to_action_type: "SHOP_NOW",
  link_url: taggedLink,
  name: "wovain d1 · c1",
  page_id: "7",
  self_ai_disclosure: "OPT_IN",
};
const imageCreative = {
  ...shapeBase,
  headline: "Sakura Season Cat Tee",
  image_hash: imageHash,
  message: "A calico watches the sun go down.",
};
const multiMediaCreative = {
  ...shapeBase,
  headlines: ["Sakura Season Cat Tee", "The cat tee for spring"],
  multi_media: [{ image_hash: imageHash }, { video_id: "8" }],
  primary_texts: ["A calico watches the sun go down."],
};
const cards = [
  { headline: "Cat tee", image_hash: imageHash, link: taggedLink },
  { headline: "Cat mug", image_hash: imageHash, link: taggedMug },
];
const carouselCreative = {
  ...shapeBase,
  cards,
  message: "The cat set.",
  name: "wovain d1 · c3",
  self_ai_disclosure: "OPT_OUT",
};

// What Meta reads back for each shape when nothing changed.
const story = { call_to_action_type: "SHOP_NOW", id: "901" };
const imageEntity = {
  ...story,
  image_hash: imageHash,
  link_url: taggedLink,
  object_story_id: "7_100",
};
const multiMediaEntity = {
  ...story,
  images: [{ hash: imageHash }],
  link_url: taggedLink,
  object_story_id: "7_100",
  video_id: "8",
};
const carouselEntity = {
  ...story,
  child_attachments: cards.map(({ headline, ...card }) => ({
    ...card,
    name: headline,
  })),
  link_url: taggedLink,
  object_story_id: "7_100",
};

// d2 (the mug, live) and an approved carousel concept on d1 across both.
const withCarousel = async () => {
  await store.saveDesign({ ...demoDesign, productUrl: mugUrl });
  const [current] = await store.getAds();
  if (current === undefined) {
    throw new Error("no ad");
  }
  const { concepts: _concepts, status: _status, ...ad } = current;
  await store.saveConcepts(ad, [
    {
      angle: "The set",
      assets: [],
      audience: "Cat people",
      cards: [
        {
          designId: "d1",
          headline: "Cat tee",
          imageUrl: "https://cdn.fourthwall.com/x.webp",
        },
        { designId: "d2", headline: "Cat mug", imageUrl: mugImage },
      ],
      cta: "SHOP_NOW",
      headlines: ["The cat set"],
      hook: "One cat, every room.",
      id: "c3",
      name: "Set",
      primaryTexts: ["The cat set."],
    },
  ]);
  await store.recordConcept("d1", "c3", "approved");
};

const uploads = [videoArgs, imageArgs, mugUpload];
const shapes = [
  ["single image", "image", imageCreative, imageEntity],
  ["multi-media", "multi_media", multiMediaCreative, multiMediaEntity],
  ["carousel", "carousel", carouselCreative, carouselEntity],
] as const;

test.each(shapes)(
  "a %s creative is staged with its media and launched when the read-back matches",
  async (_label, shape, creative, creativeEntity) => {
    await withCarousel();
    const env = await launchable({ creativeEntity }, creative, uploads);
    const record = await env.upstream.staged.get("test");
    expect(record?.creatives).toEqual([
      expect.objectContaining({ cta: "SHOP_NOW", id: "901", shape }),
    ]);
    await expect(env.confirmByMerchant()).resolves.toBe(true);
    const result = await env.launch();
    expect(result.isError).toBeFalsy();
    expect(env.activations()).toHaveLength(1);
    await env.client.close();
  }
);

test("a carousel records its cards in order", async () => {
  await withCarousel();
  const env = await staged(true, carouselCreative, uploads);
  const record = await env.upstream.staged.get("test");
  expect(record?.creatives[0]?.cards).toEqual([
    { headline: "Cat tee", imageHash, link: taggedLink },
    { headline: "Cat mug", imageHash, link: taggedMug },
  ]);
  await env.client.close();
});

const shapeRefusals: [string, Record<string, unknown>][] = [
  [
    "a single image with a foreign image_hash",
    { ...imageCreative, image_hash: foreignHash },
  ],
  [
    "a single image with a foreign link",
    { ...imageCreative, link_url: "https://evil.example/tee" },
  ],
  [
    "a single image by image_url",
    { ...imageCreative, image_url: "https://evil.example/x.png" },
  ],
  [
    "a CTA that isn't a shopping one",
    { ...imageCreative, call_to_action_type: "WHATSAPP_MESSAGE" },
  ],
  [
    "placement asset customization",
    {
      ...imageCreative,
      placement_customizations: [{ image_hash: imageHash }, { video_id: "8" }],
    },
  ],
  [
    "multi-media with a foreign image_hash",
    {
      ...multiMediaCreative,
      multi_media: [{ image_hash: foreignHash }, { video_id: "8" }],
    },
  ],
  [
    "multi-media with a foreign video",
    {
      ...multiMediaCreative,
      multi_media: [{ image_hash: imageHash }, { video_id: "99" }],
    },
  ],
  [
    "multi-media by image_url",
    {
      ...multiMediaCreative,
      multi_media: [
        { image_url: "https://evil.example/x.png" },
        { video_id: "8" },
      ],
    },
  ],
  [
    "multi-media repeating a visual",
    {
      ...multiMediaCreative,
      multi_media: [{ video_id: "8" }, { video_id: "8" }],
    },
  ],
  [
    "multi-media with a foreign link",
    { ...multiMediaCreative, link_url: "https://evil.example/tee" },
  ],
  [
    "a carousel card with a foreign link",
    {
      ...carouselCreative,
      cards: [cards[0], { ...cards[1], link: "https://evil.example/mug" }],
    },
  ],
  [
    "a carousel card with a foreign image_hash",
    {
      ...carouselCreative,
      cards: [cards[0], { ...cards[1], image_hash: foreignHash }],
    },
  ],
  [
    "a carousel card with an extra key",
    { ...carouselCreative, cards: [cards[0], { ...cards[1], video_id: "8" }] },
  ],
  ["a carousel of one card", { ...carouselCreative, cards: [cards[0]] }],
];

test.each(shapeRefusals)(
  "campaign_draft refuses %s",
  async (_label, creative) => {
    await withCarousel();
    const env = await staged(false, creativeArgs, uploads);
    const before = env.fake.calls.length;
    const result = await env.draft("ads_create_creative", creative);
    expect(result.isError).toBe(true);
    expect(env.fake.calls).toHaveLength(before);
    await env.client.close();
  }
);

const readBackRefusals: [
  string,
  Record<string, unknown>,
  Record<string, unknown>,
][] = [
  [
    "a single image's hash",
    imageCreative,
    { ...imageEntity, image_hash: foreignHash },
  ],
  [
    "a single image's link",
    imageCreative,
    { ...imageEntity, link_url: "https://evil.example" },
  ],
  [
    "a single image's CTA",
    imageCreative,
    { ...imageEntity, call_to_action_type: "SIGN_UP" },
  ],
  [
    "a multi-media pool without its video",
    multiMediaCreative,
    { ...multiMediaEntity, video_id: undefined },
  ],
  [
    "a multi-media pool with a foreign image",
    multiMediaCreative,
    {
      ...multiMediaEntity,
      images: [{ hash: imageHash }, { hash: foreignHash }],
    },
  ],
  [
    "a multi-media pool with a foreign link",
    multiMediaCreative,
    {
      ...multiMediaEntity,
      link_urls: [{ website_url: "https://evil.example" }],
    },
  ],
  [
    "a carousel card's link",
    carouselCreative,
    {
      ...carouselEntity,
      child_attachments: [
        carouselEntity.child_attachments[0],
        {
          ...carouselEntity.child_attachments[1],
          link: "https://evil.example",
        },
      ],
    },
  ],
  [
    "a carousel card's image",
    carouselCreative,
    {
      ...carouselEntity,
      child_attachments: [
        carouselEntity.child_attachments[0],
        { ...carouselEntity.child_attachments[1], image_hash: foreignHash },
      ],
    },
  ],
  [
    "a carousel missing a card",
    carouselCreative,
    {
      ...carouselEntity,
      child_attachments: [carouselEntity.child_attachments[0]],
    },
  ],
  [
    "carousel cards in another order",
    carouselCreative,
    {
      ...carouselEntity,
      child_attachments: carouselEntity.child_attachments.toReversed(),
    },
  ],
];

test.each(readBackRefusals)(
  "launch_campaign stops when the read-back changes %s",
  async (_label, creative, creativeEntity) => {
    await withCarousel();
    const env = await launchable({ creativeEntity }, creative, uploads);
    await env.confirmByMerchant();
    const result = await env.launch();
    expect(result.isError).toBe(true);
    expect(env.activations()).toEqual([]);
    await env.client.close();
  }
);

test.each(shapes)(
  "a %s ad whose concept changed after the merchant confirmed isn't launched",
  async (_label, _shape, creative, creativeEntity) => {
    await withCarousel();
    const env = await launchable({ creativeEntity }, creative, uploads);
    await expect(env.confirmByMerchant()).resolves.toBe(true);
    const [current] = await store.getAds();
    const concept = current?.concepts.find(
      (item) => item.id === (creative === carouselCreative ? "c3" : "c1")
    );
    if (current === undefined || concept === undefined) {
      throw new Error("no concept");
    }
    const { concepts: _concepts, status: _status, ...ad } = current;
    const { revision: _revision, status: _conceptStatus, ...input } = concept;
    await store.saveConcepts(ad, [
      { ...input, headlines: ["A different headline"] },
    ]);
    await store.recordConcept("d1", concept.id, "approved");
    const result = await env.launch();
    expect(result.isError).toBe(true);
    expect(env.activations()).toEqual([]);
    await env.client.close();
  }
);

test("a staged video creative recorded before the shapes still reads", async () => {
  const { db } = testStorage();
  const legacy = {
    id: "901",
    imageHash,
    linkUrl: taggedLink,
    pageId: "7",
    videoId: "8",
  };
  await db
    .collection("metaDrafts")
    .doc("old")
    .set({
      adAccountId: "42",
      adSets: [],
      ads: [],
      campaignId: "555",
      creatives: [legacy],
      frozen: false,
      images: [imageHash],
      videos: ["8"],
    });
  const record = await createStagedObjects(db).get("old");
  expect(record?.creatives).toEqual([
    {
      cards: [],
      copy: "",
      cta: "SHOP_NOW",
      id: "901",
      imageHashes: [imageHash],
      linkUrl: taggedLink,
      pageId: "7",
      shape: "video",
      videoIds: ["8"],
    },
  ]);
});
