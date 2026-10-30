import { describe, expect, it } from "vitest";

import { AD_RULE_DEFAULTS, decideCampaign, designResultsOf } from "./ad-rules";
import type { AdResults } from "./ad-rules";
import { designFloorCents, stagePausedCampaign } from "./ads";
import type { WriteOnce } from "./ads";
import { activateCampaign, verifyStagedPaused } from "./media-buying";
import type { ToolCall } from "./upstream";

// A drop's multi-design test (openspec ads-design-test): one campaign on
// Meta's campaign budget, an ad set per design with a floor of the budget,
// an ad per copy variant.

const meta = () => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  let next = 0;
  const id = (prefix: string) => {
    next += 1;
    return `${prefix}_${next}`;
  };
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    const replies: Record<string, () => unknown> = {
      ads_activate_entity: () => ({ status: "PUBLISHING" }),
      ads_create_ad: () => ({ ad_id: id("ad") }),
      ads_create_ad_set: () => ({ ad_set_id: id("as") }),
      ads_create_campaign: () => ({ campaign_id: "c_1" }),
      ads_create_creative: () => ({ creative_id: id("cr") }),
      ads_get_ad_entities: () => ({ ad_drafts: [] }),
    };
    const reply = replies[tool];
    if (reply === undefined) {
      throw new Error(`unexpected tool ${tool}`);
    }
    return await Promise.resolve(reply());
  };
  return { call, calls };
};

const COPY = [
  { angle: "humor", headline: "h1", message: "m1" },
  { angle: "gift", headline: "h2", message: "m2" },
];

const design = (n: number) => ({
  copy: COPY,
  imageUrl: `https://cdn.example.com/${n}.png`,
  key: `prod_${n}`,
  label: `d${n}`,
  linkUrl: `https://shop.example.com/products/${n}`,
});

const plan = {
  adAccountId: "222",
  copy: COPY,
  countries: ["US"],
  dailyBudgetCents: 3000,
  designs: [design(1), design(2), design(3)],
  imageUrl: "https://cdn.example.com/1.png",
  linkUrl: "https://shop.example.com/products/1",
  name: "wovain · test of 3 designs",
  pageId: "p_1",
  tag: "w-test",
  targeting: { geo_locations: { countries: ["US"] } },
};

// Records each keyed write, and answers a second staging from them.
const keyedOnce = () => {
  const done = new Map<string, string>();
  const once: WriteOnce = async (name, perform) => {
    const saved = done.get(name);
    if (saved !== undefined) {
      return saved;
    }
    const made = await perform();
    done.set(name, made);
    return made;
  };
  return { done, once };
};

describe("a multi-design test campaign", () => {
  it("stages one campaign, an ad set per design with a budget floor and an ad per variant", async () => {
    const { call, calls } = meta();
    const staged = await stagePausedCampaign(call, plan);

    const of = (tool: string) => calls.filter((item) => item.tool === tool);
    expect(of("ads_create_campaign")).toHaveLength(1);
    expect(of("ads_create_campaign")[0]?.args).toMatchObject({
      campaign_daily_budget: 3000,
    });
    const adSets = of("ads_create_ad_set");
    expect(adSets).toHaveLength(3);
    // Half of $30 split over 3 designs: $5 each.
    expect(designFloorCents(3000, 3)).toBe(500);
    for (const adSet of adSets) {
      expect(adSet.args).toMatchObject({
        campaign_id: "c_1",
        daily_min_spend_target: 500,
      });
      expect(adSet.args).not.toHaveProperty("daily_budget");
    }
    expect(of("ads_create_ad")).toHaveLength(6);
    expect(staged.designs?.map((each) => each.key)).toEqual([
      "prod_1",
      "prod_2",
      "prod_3",
    ]);
    expect(staged.designs?.map((each) => each.adIds.length)).toEqual([2, 2, 2]);
    expect(staged.adIds).toHaveLength(6);
    // Each design's ads point at its own product and image.
    const creatives = of("ads_create_creative");
    expect(creatives.map((item) => item.args["image_url"])).toEqual([
      "https://cdn.example.com/1.png",
      "https://cdn.example.com/1.png",
      "https://cdn.example.com/2.png",
      "https://cdn.example.com/2.png",
      "https://cdn.example.com/3.png",
      "https://cdn.example.com/3.png",
    ]);
  });

  it("gives a design with a winning track record more of the floor", async () => {
    const { call, calls } = meta();
    await stagePausedCampaign(call, {
      ...plan,
      designs: [
        { ...design(1), floorShare: 0.5 },
        { ...design(2), floorShare: 0.25 },
        { ...design(3), floorShare: 0.25 },
      ],
    });
    const floors = calls
      .filter((item) => item.tool === "ads_create_ad_set")
      .map((item) => item.args["daily_min_spend_target"]);
    // Half of $30 is the floor: $7.50, then $3.75 each.
    expect(floors).toEqual([750, 375, 375]);
  });

  it("keeps one write key per design object, so a retry makes nothing twice", async () => {
    const { call, calls } = meta();
    const { done, once } = keyedOnce();
    const first = await stagePausedCampaign(call, plan, once);
    const made = calls.length;
    const again = await stagePausedCampaign(call, plan, once);

    expect(again).toEqual(first);
    // The retry only resolves the account's Page again; no create is sent.
    expect(
      calls.slice(made).filter((item) => item.tool.startsWith("ads_create"))
    ).toHaveLength(0);
    expect([...done.keys()]).toEqual(
      expect.arrayContaining([
        "campaign@222",
        "ad_set:0",
        "ad_set:2",
        "creative:1:0",
        "ad:2:1",
      ])
    );
  });

  it("keeps a single design's names and keys, with no floor", async () => {
    const { call, calls } = meta();
    const { done, once } = keyedOnce();
    await stagePausedCampaign(
      call,
      { ...plan, designs: undefined, name: "wovain · Cat" },
      once
    );
    const adSet = calls.find((item) => item.tool === "ads_create_ad_set");
    expect(adSet?.args).not.toHaveProperty("daily_min_spend_target");
    expect(String(adSet?.args["ad_set_name"])).toBe(
      "wovain · Cat · qloo · w-test"
    );
    expect([...done.keys()]).toEqual(
      expect.arrayContaining(["ad_set", "creative:0", "ad:1"])
    );
  });

  it("refuses more than five designs", async () => {
    const { call } = meta();
    await expect(
      stagePausedCampaign(call, {
        ...plan,
        designs: [1, 2, 3, 4, 5, 6].map((n) => design(n)),
      })
    ).rejects.toThrow("5 designs at most");
  });

  it("checks and activates every design's ad set", async () => {
    const { call, calls } = meta();
    const staged = await stagePausedCampaign(call, plan);
    const before = calls.length;
    await expect(
      verifyStagedPaused(call, staged, { wait: async () => {} })
    ).rejects.toThrow();
    calls.length = before;
    await activateCampaign(call, staged);
    const sets = calls
      .filter(
        (item) =>
          item.tool === "ads_activate_entity" &&
          item.args["entity_type"] === "ad_set"
      )
      .map((item) => item.args["entity_id"]);
    expect(sets).toEqual(staged.designs?.map((each) => each.adSetId));
  });
});

const ad = (adId: string, overrides: Partial<AdResults> = {}): AdResults => ({
  active: true,
  adId,
  addToCarts: 0,
  clicks: 20,
  impressions: 1500,
  purchases: 0,
  spendCents: 500,
  ...overrides,
});

const cheap = { priceCents: 2500, profitCents: 600 };
const dear = { priceCents: 4500, profitCents: 2000 };

describe("design results", () => {
  it("names the most profitable design with a sale the winner", () => {
    const results = designResultsOf(
      [
        ad("a1", { purchases: 2, spendCents: 800 }),
        ad("b1", { purchases: 1, spendCents: 900 }),
        ad("c1"),
      ],
      [
        { adIds: ["a1"], economics: cheap, key: "p_a" },
        { adIds: ["b1"], economics: dear, key: "p_b" },
        { adIds: ["c1"], economics: cheap, key: "p_c" },
      ],
      AD_RULE_DEFAULTS
    );
    expect(results.map((each) => [each.key, each.status.state])).toEqual([
      ["p_a", "testing"],
      ["p_b", "winner"],
      ["p_c", "testing"],
    ]);
    expect(results[1]).toMatchObject({ profitCents: 1100, purchases: 1 });
    expect(results[0]?.ctr).toBeCloseTo(20 / 1500);
  });

  it("shows why a design whose ads are all off was paused", () => {
    const [result] = designResultsOf(
      [ad("a1", { active: false, spendCents: 700 })],
      [{ adIds: ["a1"], economics: cheap, key: "p_a" }],
      AD_RULE_DEFAULTS
    );
    expect(result?.status.state).toBe("paused");
    expect(
      result?.status.state === "paused" ? result.status.reason : ""
    ).toContain("no sale");
  });

  it("judges each design's ads on its own product's profit", () => {
    // $7 spent, no sale: over the cheap design's $6 profit, under the dear
    // design's $20.
    const decision = decideCampaign(
      {
        ads: [ad("a1", { spendCents: 700 }), ad("b1", { spendCents: 700 })],
        campaignId: "c",
        dailyBudgetCents: 3000,
        economics: dear,
        economicsByAd: new Map([
          ["a1", cheap],
          ["b1", dear],
        ]),
        learning: true,
        live: true,
      },
      AD_RULE_DEFAULTS,
      { now: new Date(), roomCents: 0 }
    );
    expect(decision.kind).toBe("pause_ads");
    expect(
      decision.kind === "pause_ads" ? decision.kills.map((k) => k.adId) : []
    ).toEqual(["a1"]);
  });
});
