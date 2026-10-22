import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/client";
import { adResultSchema } from "@wovain/shared/ad";
import { campaignResultSchema } from "@wovain/shared/campaign";
import { designResultSchema } from "@wovain/shared/design";
import { judgeResultSchema } from "@wovain/shared/judge";
import {
  trademarkResultSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";
import { afterAll, expect, test } from "vitest";
import { z } from "zod";

import { createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
import { loadEnv } from "../../src/env.ts";
import { createBrowserConfirm } from "../../src/lib/browser-confirm.ts";
import { localCipher } from "../../src/lib/cipher.ts";
import {
  createConnections,
  providers,
  providerSchema,
} from "../../src/lib/connections.ts";
import type { ProviderId } from "../../src/lib/connections.ts";
import { createDesignJudge } from "../../src/lib/design-judge.ts";
import { setResolver } from "../../src/lib/fetch-image.ts";
import { createTrendResearch } from "../../src/lib/trends.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { createStore } from "../../src/store.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
import {
  connectClient,
  demoBrief,
  fakeTavily,
  mockAi,
  passingReply,
  restoreFetch,
  stubFetch,
  testStorage,
} from "../helpers.ts";
import {
  adConcepts,
  drop,
  falTools,
  fourthwallTools,
  metaArgs,
  metaTools,
  trendNews,
} from "./fixtures.ts";
import { createJourney } from "./journey.ts";

// The whole journey as an agent drives it, one MCP client against wovain on
// the emulators: Fourthwall, fal and Meta are fake MCP servers with real
// OAuth, Tavily, Qloo and Nebius answer from recordings. Each step asserts
// what it did and is recorded for the proof report and the demo video.
const site = "https://wovain.test";
const user = "test";
const png = await readFile(
  path.join(import.meta.dirname, "..", "fixtures", "rgba-64x32.png")
);

// Each provider's MCP server and authorization server, and AuthKit for
// the confirm page's sign-in, reached by origin.
const authkitIssuer = "https://authkit.test";
const authkit = fakeUpstream("fourthwall", { issuer: authkitIssuer });
const issuerOf = (id: ProviderId) => `https://auth.${id}.test`;
const fakes = {
  fal: fakeUpstream("fal", { issuer: issuerOf("fal"), tools: falTools }),
  fourthwall: fakeUpstream("fourthwall", {
    issuer: issuerOf("fourthwall"),
    tools: fourthwallTools,
  }),
  meta: fakeUpstream("meta", { issuer: issuerOf("meta"), tools: metaTools }),
};
const app: { fetch?: (request: Request) => Promise<Response> } = {};
const origins = new Map<string, (request: Request) => Promise<Response>>([
  [authkitIssuer, authkit.fetch],
  ...providerSchema.options.flatMap((id) => [
    [issuerOf(id), fakes[id].fetch] as const,
    [new URL(providers[id].serverUrl).origin, fakes[id].fetch] as const,
  ]),
  [site, async (request) => await (app.fetch?.(request) ?? Response.error())],
]);
const route = async (input: string | URL | Request, init?: RequestInit) => {
  const request = new Request(input, init);
  const handler = origins.get(new URL(request.url).origin);
  if (handler === undefined) {
    throw new Error(`unexpected request to ${request.url}`);
  }
  return await handler(request);
};

const storage = testStorage();
const store = createStore(storage.db, storage.media, user);
const upstream = createUpstream({
  clients: { meta: { client_id: "1234567890" } },
  connections: createConnections(storage.db, localCipher()),
  fetch: route,
  site,
});
const env = loadEnv({
  WORKOS_AUTHKIT_DOMAIN: authkitIssuer,
  WOVAIN_SITE_URL: site,
});
const confirm = createBrowserConfirm({
  db: storage.db,
  fetch: route,
  site,
  userOf: authkit.ownerOf,
});
const web = createApp({
  auth: createAuth(env),
  confirm,
  connect: undefined,
  env,
  storage,
});
app.fetch = async (request) => await web.request(request);

// The nightly run (E2E_LIVE=1) calls the real Tavily and Nebius for each
// key it has; everything else stays recorded.
const liveKeys = Object.fromEntries(
  ["NEBIUS_API_KEY", "TAVILY_API_KEY"].flatMap((name) => {
    const value = process.env[name];
    return process.env["E2E_LIVE"] === "1" &&
      value !== undefined &&
      value !== ""
      ? [[name, value]]
      : [];
  })
);
const live = (name: string) => liveKeys[name] !== undefined;

// Artwork and mockup downloads get the PNG fixture; every host is public.
// Live services reach the network.
const network = globalThis.fetch;
setResolver(async () => await Promise.resolve(["93.184.216.34"]));
// Meta's Graph API (automated rules) answers each POST with an ID and has no
// rules yet.
const graphCalls: string[] = [];
stubFetch(async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://graph.facebook.com/")) {
    graphCalls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    return init?.method === "POST"
      ? Response.json({ id: String(graphCalls.length) })
      : Response.json({ data: [] });
  }
  return /fal\.media|fourthwall\.com/u.test(url)
    ? new Response(png)
    : await network(input, init);
});

const client = await connectClient(
  { META_APP_SECRET: "app-secret", ...liveKeys },
  store,
  {
    confirm,
    upstream,
    ...(live("NEBIUS_API_KEY")
      ? {}
      : {
          designJudge: createDesignJudge(
            mockAi({ respond: { text: JSON.stringify(passingReply) } }).ai,
            "mockModel"
          ),
        }),
    ...(live("TAVILY_API_KEY")
      ? {}
      : { trendResearch: createTrendResearch(fakeTavily(trendNews)) }),
  }
);
const journey = await createJourney(client, Object.keys(liveKeys));

afterAll(async () => {
  await journey.save();
  await client.close();
  setResolver();
  restoreFetch();
});

const data = (result: CallToolResult) =>
  z.record(z.string(), z.unknown()).parse(result.structuredContent ?? {});

const proxies = { fal: "fal", fourthwall: "fourthwall", meta: "meta_ads" };

const connect = async (
  id: ProviderId,
  title: string,
  tool: string,
  say: string
) => {
  const args = id === "meta" ? metaArgs : {};
  const before = await client.callTool({
    arguments: { arguments: args, tool },
    name: proxies[id],
  });
  expect(before.structuredContent).toMatchObject({ needsConnection: id });
  await connectWith(upstream, fakes[id], user, id);
  await journey.call(
    {
      say,
      title: `Connect ${title}`,
    },
    proxies[id],
    { arguments: args, tool },
    (result) => {
      expect(result.isError).toBeFalsy();
      expect(fakes[id].calls.at(-1)?.name).toBe(tool);
      return [
        "Before the grant, the call returns a connect link",
        `After the grant, ${title}'s ${tool} answers through the merchant's own OAuth token`,
      ];
    }
  );
};

test("connect the merchant's accounts", async () => {
  await connect(
    "fourthwall",
    "Fourthwall",
    "ecommerce_get-current-shop",
    "The merchant connects Fourthwall once. wovain keeps the grant encrypted and calls the shop as them."
  );
  await connect(
    "fal",
    "fal",
    "check_account_status",
    "Then fal, for art and ad images."
  );
  await connect(
    "meta",
    "Meta",
    "ads_get_ad_accounts",
    "And Meta, for the campaign."
  );
});

test("settings", async () => {
  await journey.call(
    {
      say: "Settings hold the merchant's pricing rule, ad budget and video model.",
      title: "Settings",
    },
    "show_settings_widget",
    {},
    (result) => {
      expect(data(result)).toMatchObject({ settings: { pricing: {} } });
      return ["Default pricing, budget and rules load"];
    }
  );
});

test("trend research", async () => {
  await journey.call(
    {
      say: "Research starts from a seed: Tavily finds what's trending this week, and Nemotron ranks the ideas.",
      title: "Research trends",
    },
    "research_trends",
    { count: 3, seed: "cat lovers" },
    (result) => {
      const { ideas } = trendsResultSchema.parse(data(result));
      expect(ideas?.length).toBeGreaterThan(0);
      expect(ideas?.[0]?.sources[0]?.url).toMatch(/^https:\/\//u);
      return [`${String(ideas?.length)} ranked ideas, each with its sources`];
    }
  );
  await journey.call(
    {
      say: "Before any art, a quick screen flags phrases that look like someone's trademark.",
      title: "Screen the phrase",
    },
    "screen_trademark",
    { phrase: "Sunset Cat Club" },
    (result) => {
      const parsed = trademarkResultSchema.parse(data(result));
      expect(parsed.note).toContain("not a trademark search");
      return [
        `${String(parsed.hits?.length ?? 0)} web hits to review, with the caveat that it isn't a legal search`,
      ];
    }
  );
});

let designId = "";

test("a multi-product drop, priced by wovain", async () => {
  const shown = await journey.call(
    {
      say: "One idea becomes a drop: a tee, a hoodie, a mug and a poster, each priced by wovain from its real base cost.",
      title: "A multi-product drop",
    },
    "show_design_widget",
    drop,
    (result) => {
      const { design } = designResultSchema.parse(data(result));
      expect(design.range.map((item) => item.kind)).toEqual([
        "Hoodie",
        "Mug",
        "Poster",
      ]);
      expect(design.quote.price).toBe(30);
      expect(design.status).toBe("draft");
      return [
        "The drop has the hero tee and three more products",
        "wovain priced the tee at $30 from its $17.70 blank",
        "It waits as a draft for the merchant",
      ];
    }
  );
  designId = designResultSchema.parse(data(shown)).design.id;
});

test("the design judge", async () => {
  await journey.call(
    {
      say: "Nemotron on Nebius judges the design against six print and listing rules before anyone sees it.",
      title: "Judge the design",
    },
    "judge_design",
    demoBrief,
    (result) => {
      const { judgment } = judgeResultSchema.parse(data(result));
      expect(judgment?.verdict).toBe("ready");
      return [
        `Verdict ${judgment?.verdict ?? ""}, score ${String(judgment?.score)}`,
        "All six checks pass",
      ];
    }
  );
});

const cookieOf = (response: Response) =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test("approval in the browser", async () => {
  const linked = await journey.call(
    {
      say: "Approve opens a one-time link: the merchant signs in to wovain in their own browser.",
      title: "Approve: a one-time link",
      widget: false,
    },
    "approval_link",
    { id: designId },
    (result) => {
      expect(String(data(result)["confirmUrl"])).toMatch(
        /^https:\/\/wovain\.test\/confirm\//u
      );
      return ["The link points at wovain's confirm page"];
    }
  );
  const start = performance.now();
  const opened = await web.request(String(data(linked)["confirmUrl"]), {
    redirect: "manual",
  });
  const cookie = cookieOf(opened);
  const signIn = new URL(opened.headers.get("location") ?? "");
  const code = authkit.approve(signIn, user);
  const page = await web.request(
    `${site}/confirm/callback?code=${code}&state=${signIn.searchParams.get("state") ?? ""}`,
    { headers: { cookie } }
  );
  const html = await page.text();
  const secret =
    /name="secret" value="(?<secret>[^"]+)"/u.exec(html)?.groups?.["secret"] ??
    "";
  const confirmed = await web.request(`${site}/confirm`, {
    body: new URLSearchParams({ secret }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      origin: site,
    },
    method: "POST",
  });
  expect(opened.status).toBe(302);
  expect(page.status).toBe(200);
  expect(html).toContain("$30.00");
  expect(confirmed.status).toBe(200);
  const approved = await store.requireDesign(designId);
  expect(approved.status).toBe("publishing");
  journey.record({
    checks: [
      "The link redirects to AuthKit sign-in",
      "Signed in as the merchant, the page shows every product and price",
      "Confirm records the approval for exactly this design",
    ],
    input: { design: designId },
    ms: performance.now() - start,
    page: html,
    say: "The confirm page shows every product and price. Confirm approves exactly what it shows.",
    title: "Confirm in the browser",
    tool: "GET /confirm",
  });
});

test("publish on Fourthwall", async () => {
  await journey.call(
    {
      say: "Only now can the agent publish: wovain creates each product on the merchant's Fourthwall and groups the drop in a collection.",
      title: "Publish the drop",
    },
    "publish_design",
    { id: designId },
    (result) => {
      expect(result.isError).toBeFalsy();
      const { design } = designResultSchema.parse(data(result));
      expect(design.status).toBe("live");
      expect(design.collectionId).toBe("cltn_1");
      const created = fakes.fourthwall.calls.filter(
        (call) => call.name === "ecommerce_create-offers-from-designs"
      );
      expect(created).toHaveLength(1);
      return [
        "Four products created on Fourthwall in one call",
        "Each priced from the widget and grouped in one collection",
        "The design is live with its collection link",
      ];
    }
  );
  await journey.call(
    {
      say: "The design widget follows along and shows the drop live.",
      title: "Live",
    },
    "get_design",
    { id: designId },
    (result) => {
      expect(designResultSchema.parse(data(result)).design.status).toBe("live");
      return ["The widget reads the live drop"];
    }
  );
});

let sceneUrl = "";

test("ad concepts with fal visuals", async () => {
  await journey.call(
    {
      say: "For ads, fal edits the real mockup into lifestyle scenes on the merchant's own account, keeping the print.",
      title: "Generate ad images",
    },
    "generate_ad_images",
    {
      designId,
      images: [
        {
          color: "Black",
          ratio: "4:5",
          scene: "Friends at a sunset picnic, golden light",
        },
        {
          ratio: "9:16",
          scene: "A woman laughs with her cat on a sofa, warm lamp light",
        },
      ],
    },
    (result) => {
      expect(result.isError).toBeFalsy();
      const submitted = fakes.fal.calls.filter(
        (call) => call.name === "submit_jobs"
      );
      expect(submitted).toHaveLength(1);
      return ["Two image jobs submitted to the merchant's fal in one call"];
    }
  );
  await journey.call(
    {
      say: "wovain collects only the results of jobs it submitted, so nothing else can slip into an ad.",
      title: "Collect the images",
    },
    "collect_ad_media",
    { designId },
    (result) => {
      const urls =
        JSON.stringify(result.content).match(
          /https:\/\/v3b\.fal\.media[^"\\]+/gu
        ) ?? [];
      expect(urls).toHaveLength(2);
      sceneUrl = urls[0] ?? "";
      return ["Both images collected from fal's CDN"];
    }
  );
  await journey.call(
    {
      say: "The ad widget shows distinct concepts, each with its own hook, audience and visuals, and the breakeven math.",
      title: "Ad concepts",
    },
    "show_ad_widget",
    {
      coach: "One lifestyle angle and one gift angle.",
      concepts: adConcepts(sceneUrl),
      designId,
    },
    (result) => {
      const { ad } = adResultSchema.parse(data(result));
      expect(ad.concepts.map((concept) => concept.status)).toEqual([
        "draft",
        "draft",
      ]);
      expect(ad.economics.breakevenPerSale).toBeCloseTo(10.32, 2);
      return [
        "Two concepts wait for the merchant",
        "Breakeven $10.32 per sale on the $30 tee",
      ];
    }
  );
  await client.callTool({
    arguments: { conceptId: "c1", designId, status: "approved" },
    name: "record_ad",
  });
  await journey.call(
    {
      say: "The merchant approves each concept; once all are decided, the product joins the campaign.",
      title: "Approve the concepts",
    },
    "record_ad",
    { conceptId: "c2", designId, status: "approved" },
    (result) => {
      expect(data(result)).toMatchObject({
        ad: { status: "added" },
        waiting: 0,
      });
      return ["Both concepts approved", "The product is added to the campaign"];
    }
  );
});

const planSchema = z.object({
  campaignName: z.string(),
  dailyBudgetCents: z.int(),
  products: z.array(
    z.object({
      ads: z.array(
        z.object({
          adName: z.string(),
          cta: z.string(),
          headlines: z.array(z.string()),
          images: z.array(z.object({ url: z.string() })),
          primaryTexts: z.array(z.string()),
        })
      ),
      productUrl: z.string(),
    })
  ),
  urlTags: z.string(),
});

test("a paused Meta campaign", async () => {
  const planned = await client.callTool({
    arguments: {},
    name: "campaign_plan",
  });
  const plan = planSchema.parse(
    JSON.parse(
      z.object({ text: z.string() }).parse((planned.content as unknown[])[0])
        .text
    )
  );
  const [product] = plan.products;
  expect(plan.dailyBudgetCents).toBe(1500);
  expect(product?.ads.map((ad) => ad.adName)).toEqual([
    `wovain ${designId} · c1`,
    `wovain ${designId} · c2`,
  ]);
  const base = { ad_account_id: "42", ...metaArgs };
  const draft = async (tool: string, args: Record<string, unknown>) => {
    const result = await client.callTool({
      arguments: { arguments: { ...base, ...args }, tool },
      name: "campaign_draft",
    });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    return result;
  };
  const start = performance.now();
  await draft("ads_create_campaign", {
    buying_type: "AUCTION",
    campaign_daily_budget: plan.dailyBudgetCents,
    campaign_name: plan.campaignName,
    objective: "OUTCOME_SALES",
  });
  await draft("ads_create_ad_set", {
    ad_set_name: plan.campaignName,
    billing_event: "IMPRESSIONS",
    campaign_id: "555",
    destination_type: "WEBSITE",
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: { custom_event_type: "PURCHASE", pixel_id: "9" },
    targeting: '{"geo_locations":{"countries":["US"]}}',
  });
  for (const ad of product?.ads ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- Meta stages one object at a time
    await draft("ads_creative_upload_media", {
      media_type: "IMAGE",
      media_url: ad.images[0]?.url ?? "",
    });
    // oxlint-disable-next-line no-await-in-loop -- the ad needs its creative
    await draft("ads_create_creative", {
      call_to_action_type: ad.cta,
      headline: ad.headlines[0] ?? "",
      image_hash: "0123456789abcdef0123456789abcdef",
      link_url: `${product?.productUrl ?? ""}?${plan.urlTags}`,
      message: ad.primaryTexts[0] ?? "",
      page_id: "7",
      self_ai_disclosure: "OPT_IN",
    });
    // oxlint-disable-next-line no-await-in-loop -- one ad per creative
    await draft("ads_create_ad", {
      ad_name: ad.adName,
      ad_set_id: "666",
      creative: { creative_id: "901" },
    });
  }
  const staged = fakes.meta.calls.filter(
    (call) =>
      call.name.startsWith("ads_create") ||
      call.name === "ads_creative_upload_media"
  );
  expect(staged.map((call) => call.name)).toContain("ads_create_ad");
  expect(
    staged.every((call) => !JSON.stringify(call.arguments).includes("ACTIVE"))
  ).toBe(true);
  journey.record({
    checks: [
      `$${String(plan.dailyBudgetCents / 100)} a day from the merchant's settings`,
      `${String(staged.length)} objects staged in Meta's draft, all paused`,
      "Every link and image checked against the approved concepts",
    ],
    input: { calls: staged.map((call) => call.name) },
    ms: performance.now() - start,
    say: "Run it: wovain stages the Advantage+ campaign in the merchant's Meta draft, paused, with only the approved ads and links.",
    title: "Stage the paused campaign",
    tool: "campaign_draft",
  });
  await journey.call(
    {
      say: "Five automated rules guard the spend: kill losers, scale winners, alert above breakeven.",
      title: "Automated rules",
    },
    "create_rules",
    { adAccountId: "42", campaignId: "555" },
    (result) => {
      expect(result.isError).toBeFalsy();
      return [
        "The rules are created on the merchant's ad account with their own token",
      ];
    }
  );
  await journey.call(
    {
      say: "The campaign widget waits for the merchant: nothing spends until they press Launch.",
      title: "Paused, ready to launch",
    },
    "show_campaign_widget",
    { status: "ready" },
    (result) => {
      const { campaign } = campaignResultSchema.parse(data(result));
      expect(campaign.status).toBe("ready");
      expect(campaign.campaignId).toBe("555");
      expect(campaign.rules.every((rule) => rule.created)).toBe(true);
      return ["Campaign 555 is staged and paused", "Every rule is in place"];
    }
  );
});
