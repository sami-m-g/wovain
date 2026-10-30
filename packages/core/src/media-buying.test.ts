import { describe, expect, it, vi } from "vitest";

import { adSetTargeting, withUtm } from "./ad-delivery";
import { stagePausedCampaign } from "./ads";
import {
  activateCampaign,
  campaignStatusOf,
  findSalesPixel,
  pauseCampaign,
  readCampaignStatus,
  verifyStagedPaused,
} from "./media-buying";
import type { ToolCall } from "./upstream";

// The Meta Ads MCP server: each tool answers from `replies` (a value, or a
// function of the call's arguments), and every call is recorded in order.
const fakeMeta = (replies: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = vi.fn(async (tool, args) => {
    calls.push({ args, tool });
    if (!(tool in replies)) {
      throw new Error(`unexpected tool ${tool}`);
    }
    const reply = replies[tool];
    return await Promise.resolve(
      typeof reply === "function"
        ? (reply as (a: Record<string, unknown>) => unknown)(args)
        : reply
    );
  });
  return { call, calls };
};

const STAGED = {
  adAccountId: "222",
  adIds: ["ad_1", "ad_2"],
  adSetId: "as_1",
  campaignId: "c_1",
  creativeIds: ["cr_1", "cr_2"],
  pageId: "p_1",
};

const draftOf = (ids: string[]) => ({
  ad_drafts: ids.map((id) => ({ ad_object_id: id, status: "DRAFT" })),
});

describe("withUtm", () => {
  it("tags a product link for Fourthwall's UTM report and keeps its query", () => {
    const url = withUtm("https://shop.example.com/products/cat?ref=x", {
      campaign: "c_1",
      content: "humor-1",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe("x");
    expect(parsed.searchParams.get("utm_source")).toBe("meta");
    expect(parsed.searchParams.get("utm_medium")).toBe("paid_social");
    expect(parsed.searchParams.get("utm_campaign")).toBe("c_1");
    expect(parsed.searchParams.get("utm_content")).toBe("humor-1");
  });
});

describe("adSetTargeting", () => {
  it("keeps Advantage+ audience on with the countries as hard limits", () => {
    expect(adSetTargeting({ countries: ["US", "CA"] })).toEqual({
      geo_locations: { countries: ["US", "CA"] },
      targeting_automation: { advantage_audience: 1 },
    });
  });

  it("passes ages and genders as suggestions and never narrows below 18", () => {
    expect(
      adSetTargeting({
        ageMax: 34,
        ageMin: 16,
        countries: ["US"],
        genders: ["female"],
      })
    ).toEqual({
      age_max: 34,
      age_min: 18,
      genders: [2],
      geo_locations: { countries: ["US"] },
      targeting_automation: { advantage_audience: 1 },
    });
  });

  it("drops genders when the audience is everyone", () => {
    expect(
      adSetTargeting({ countries: ["US"], genders: ["female", "all"] })
    ).not.toHaveProperty("genders");
  });
});

describe("findSalesPixel", () => {
  it("uses the account's only pixel", async () => {
    const { call } = fakeMeta({
      ads_get_datasets: { data: [{ id: "px_1", name: "Shop pixel" }] },
    });
    await expect(findSalesPixel(call, "222")).resolves.toBe("px_1");
  });

  it("guesses nothing when the account has several pixels or none", async () => {
    const several = fakeMeta({
      ads_get_datasets: {
        data: [
          { id: "px_1", name: "A" },
          { id: "px_2", name: "B" },
        ],
      },
    });
    await expect(findSalesPixel(several.call, "222")).resolves.toBeUndefined();
    const none = fakeMeta({ ads_get_datasets: { data: [] } });
    await expect(findSalesPixel(none.call, "222")).resolves.toBeUndefined();
  });

  it("counts only the listed datasets, not nested objects with an id and a name", async () => {
    const owner = { id: "biz_9", name: "Owner business" };
    const nested = fakeMeta({
      ads_get_datasets: {
        data: [
          {
            creator: { id: "u_7", name: "Creator" },
            id: "px_1",
            name: "Shop pixel",
            owner_business: owner,
          },
        ],
      },
    });
    await expect(findSalesPixel(nested.call, "222")).resolves.toBe("px_1");
    const noPixel = fakeMeta({
      ads_get_datasets: { data: [], owner_business: owner },
    });
    await expect(findSalesPixel(noPixel.call, "222")).resolves.toBeUndefined();
  });
});

describe("stagePausedCampaign with media buying", () => {
  const replies = {
    ads_create_ad: { ad_id: "ad_1", status: "DRAFT" },
    ads_create_ad_set: { ad_set_id: "as_1", status: "DRAFT" },
    ads_create_campaign: { campaign_id: "c_1", status: "DRAFT" },
    ads_create_creative: { creative_id: "cr_1" },
  };
  const plan = {
    adAccountId: "222",
    copy: [
      { angle: "humor", headline: "Not today", message: "For quiet nights." },
    ],
    countries: ["US"],
    dailyBudgetCents: 1500,
    imageUrl: "https://cdn.fourthwall.com/mock.png",
    linkUrl: "https://shop.example.com/products/reading-cat",
    name: "wovain · Reading Cat",
    pageId: "p_1",
    tag: "w-test",
    targeting: { geo_locations: { countries: ["US"] } },
  };

  it("optimizes for purchases on the pixel and tags each link", async () => {
    const { call, calls } = fakeMeta(replies);
    await stagePausedCampaign(call, {
      ...plan,
      media: {
        pixelId: "px_1",
        targeting: { ageMin: 21, countries: ["US"] },
      },
    });
    const args = (tool: string) =>
      calls.find((item) => item.tool === tool)?.args;
    expect(args("ads_create_campaign")).toMatchObject({
      objective: "OUTCOME_SALES",
    });
    expect(args("ads_create_ad_set")).toMatchObject({
      destination_type: "WEBSITE",
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: JSON.stringify({
        custom_event_type: "PURCHASE",
        pixel_id: "px_1",
      }),
    });
    expect(
      JSON.parse(String(args("ads_create_ad_set")?.["targeting"]))
    ).toEqual({
      age_min: 21,
      geo_locations: { countries: ["US"] },
      targeting_automation: { advantage_audience: 1 },
    });
    const link = new URL(String(args("ads_create_creative")?.["link_url"]));
    expect(link.searchParams.get("utm_campaign")).toBe("c_1");
    expect(link.searchParams.get("utm_content")).toBe("humor-1");
  });

  it("falls back to landing page views without a pixel", async () => {
    const { call, calls } = fakeMeta(replies);
    await stagePausedCampaign(call, {
      ...plan,
      media: { targeting: { countries: ["US"] } },
    });
    expect(
      calls.find((item) => item.tool === "ads_create_campaign")?.args
    ).toMatchObject({ objective: "OUTCOME_TRAFFIC" });
    const adSet = calls.find((item) => item.tool === "ads_create_ad_set")?.args;
    expect(adSet).toMatchObject({ optimization_goal: "LANDING_PAGE_VIEWS" });
    expect(adSet).not.toHaveProperty("promoted_object");
  });
});

describe("verifyStagedPaused", () => {
  it("accepts a staging that sits whole in the draft", async () => {
    const { call } = fakeMeta({
      ads_get_ad_entities: draftOf(["c_1", "as_1", "ad_1", "ad_2"]),
    });
    await expect(verifyStagedPaused(call, STAGED)).resolves.toEqual({
      state: "draft",
    });
  });

  it("reads the draft Meta returns as JSON text", async () => {
    const { call } = fakeMeta({
      ads_get_ad_entities: {
        ad_drafts: JSON.stringify(
          draftOf(["c_1", "as_1", "ad_1", "ad_2"]).ad_drafts
        ),
      },
    });
    await expect(verifyStagedPaused(call, STAGED)).resolves.toEqual({
      state: "draft",
    });
  });

  it("waits for objects Meta doesn't show yet", async () => {
    let reads = 0;
    const { call } = fakeMeta({
      ads_get_ad_entities: (args: Record<string, unknown>) => {
        if (args["object_state"] === "draft") {
          reads += 1;
          return { ad_drafts: "[]" };
        }
        return {
          ad_entities: JSON.stringify(
            reads < 3
              ? []
              : (args["object_ids"] as string[]).map((id) => ({
                  id,
                  status: "PAUSED",
                }))
          ),
        };
      },
    });
    const wait = vi.fn(async () => {});
    await expect(verifyStagedPaused(call, STAGED, { wait })).resolves.toEqual({
      state: "paused",
    });
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("reports objects it can't read as unread, never as missing", async () => {
    const { call, calls } = fakeMeta({
      ads_get_ad_entities: { unexpected: true },
      ads_update_entity: { success: true },
    });
    const failure = verifyStagedPaused(call, STAGED, {
      wait: async () => {},
    });
    await expect(failure).rejects.toThrow(
      /couldn't read Meta objects back .*\(campaign c_1.*draft=\{unexpected:boolean\}/u
    );
    await expect(failure).rejects.not.toThrow(/missing/u);
    expect(calls.some((item) => item.tool === "ads_update_entity")).toBe(true);
  });

  it("accepts live objects that are all paused", async () => {
    const { call } = fakeMeta({
      ads_get_ad_entities: (args: Record<string, unknown>) =>
        args["object_state"] === "draft"
          ? { ad_drafts: [] }
          : {
              ad_entities: (args["object_ids"] as string[]).map((id) => ({
                effective_status: "PAUSED",
                id,
                status: "PAUSED",
              })),
            },
    });
    await expect(verifyStagedPaused(call, STAGED)).resolves.toEqual({
      state: "paused",
    });
  });

  it("pauses at once and fails when anything came back live", async () => {
    const { call, calls } = fakeMeta({
      ads_get_ad_entities: (args: Record<string, unknown>) =>
        args["object_state"] === "draft"
          ? { ad_drafts: [] }
          : {
              ad_entities: (args["object_ids"] as string[]).map((id) => ({
                effective_status: id === "ad_2" ? "ACTIVE" : "PAUSED",
                id,
                status: id === "ad_2" ? "ACTIVE" : "PAUSED",
              })),
            },
      ads_update_entity: { is_draft: false, success: true },
    });
    await expect(verifyStagedPaused(call, STAGED)).rejects.toThrow(
      /not paused/u
    );
    const pause = calls.find((item) => item.tool === "ads_update_entity");
    expect(pause?.args).toMatchObject({
      entity_id: "c_1",
      entity_type: "campaign",
      fields: JSON.stringify({ status: "PAUSED" }),
    });
  });
});

describe("activateCampaign", () => {
  it("publishes exactly the staged draft objects as active", async () => {
    const { call, calls } = fakeMeta({
      ads_activate_entity: { status: "PUBLISHING" },
      ads_get_ad_entities: draftOf(["c_1", "as_1", "ad_1", "ad_2"]),
    });
    await activateCampaign(call, STAGED);
    const activations = calls.filter(
      (item) => item.tool === "ads_activate_entity"
    );
    expect(activations).toHaveLength(1);
    expect(activations[0]?.args).toMatchObject({
      ad_account_id: "222",
      entity_id: "c_1",
      entity_type: "campaign",
      object_ids: ["c_1", "as_1", "ad_1", "ad_2"],
      publish_as_active: true,
    });
  });

  it("activates live paused objects top-down when nothing is in the draft", async () => {
    const { call, calls } = fakeMeta({
      ads_activate_entity: { success: true },
      ads_get_ad_entities: { ad_drafts: [] },
    });
    await activateCampaign(call, STAGED);
    expect(
      calls
        .filter((item) => item.tool === "ads_activate_entity")
        .map((item) => [item.args["entity_type"], item.args["entity_id"]])
    ).toEqual([
      ["campaign", "c_1"],
      ["ad_set", "as_1"],
      ["ad", "ad_1"],
      ["ad", "ad_2"],
    ]);
  });
});

describe("pauseCampaign", () => {
  it("pauses the live campaign with a status-only update", async () => {
    const { call, calls } = fakeMeta({
      ads_update_entity: { is_draft: false },
    });
    await pauseCampaign(call, STAGED);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toMatchObject({
      entity_id: "c_1",
      fields: JSON.stringify({ status: "PAUSED" }),
    });
  });
});

describe("campaign status", () => {
  it("maps Meta's effective status to wovain's", () => {
    expect(campaignStatusOf("ACTIVE")).toBe("active");
    expect(campaignStatusOf("PAUSED")).toBe("paused");
    expect(campaignStatusOf("CAMPAIGN_PAUSED")).toBe("paused");
    expect(campaignStatusOf("IN_PROCESS")).toBe("in_review");
    expect(campaignStatusOf("PENDING_REVIEW")).toBe("in_review");
    expect(campaignStatusOf("WITH_ISSUES")).toBe("with_issues");
    expect(campaignStatusOf("DISAPPROVED")).toBe("with_issues");
    expect(campaignStatusOf("ARCHIVED")).toBe("archived");
    expect(campaignStatusOf("PUBLISHING")).toBe("publishing");
    expect(campaignStatusOf("SOMETHING_NEW")).toBe("unknown");
  });

  it("reads a campaign still in the draft as draft", async () => {
    const { call } = fakeMeta({
      ads_get_ad_entities: (args: Record<string, unknown>) =>
        args["object_state"] === "draft"
          ? draftOf(["c_1"])
          : { ad_entities: [] },
    });
    await expect(readCampaignStatus(call, STAGED)).resolves.toBe("draft");
  });

  it("reads the live campaign's effective status", async () => {
    const { call } = fakeMeta({
      ads_get_ad_entities: (args: Record<string, unknown>) =>
        args["object_state"] === "draft"
          ? { ad_drafts: [] }
          : { ad_entities: [{ effective_status: "ACTIVE", id: "c_1" }] },
    });
    await expect(readCampaignStatus(call, STAGED)).resolves.toBe("active");
  });
});
