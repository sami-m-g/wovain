import { describe, expect, it, vi } from "vitest";

import { stagePausedCampaign } from "./ads";
import { createArtist, TEXT_TO_IMAGE } from "./fal";
import {
  createProduct,
  publishProduct,
  searchCatalog,
  uploadArtwork,
} from "./fourthwall";
import type { ToolCall } from "./upstream";

// A provider's MCP server: each tool answers from `replies`, and every call
// is recorded in order.
const fakeServer = (replies: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = vi.fn(async (tool, args) => {
    calls.push({ args, tool });
    if (!(tool in replies)) {
      throw new Error(`unexpected tool ${tool}`);
    }
    const reply = replies[tool];
    return await Promise.resolve(
      typeof reply === "function" ? (reply as () => unknown)() : reply
    );
  });
  return { call, calls };
};

describe("Fourthwall", () => {
  it("keeps catalog blanks that can render a front print", async () => {
    const { call } = fakeServer({
      "ecommerce_get-catalog-products": {
        products: [
          {
            id: "prd_tee",
            name: "Comfort Tee",
            priceFrom: 13.5,
            printDetails: {
              printAreas: [
                {
                  name: "Front",
                  supportsBackendRendering: true,
                  type: "front",
                },
                {
                  name: "Front large",
                  supportsBackendRendering: true,
                  type: "front_large",
                },
              ],
              supportsBackendRendering: true,
            },
            slug: "comfort-tee",
          },
          {
            id: "prd_mug",
            name: "Mug",
            printDetails: { printAreas: [], supportsBackendRendering: false },
            slug: "mug",
          },
        ],
      },
    });

    const blanks = await searchCatalog(call);

    expect(blanks).toEqual([
      {
        baseCost: 13.5,
        id: "prd_tee",
        name: "Comfort Tee",
        region: "front_large",
        slug: "comfort-tee",
      },
    ]);
  });

  it("uploads art through the signed URL and the media library", async () => {
    const { call, calls } = fakeServer({
      "confirm-image-upload": { url: "gs://bucket/up_1.png" },
      "ecommerce_save-media-library-image": {
        image: { uri: "https://cdn.fourthwall.com/m/1.png" },
      },
      "request-upload-url": {
        signedUrl: "https://storage.example/put",
        uploadId: "up_1",
      },
    });
    const fetchFn = vi.fn(
      async (url: string | URL | Request) =>
        await Promise.resolve(
          new Response(String(url).includes("fal.media") ? "png-bytes" : null, {
            status: 200,
          })
        )
    );

    const uri = await uploadArtwork(
      call,
      { height: 2880, url: "https://v3.fal.media/art.png", width: 2880 },
      fetchFn
    );

    expect(uri).toBe("https://cdn.fourthwall.com/m/1.png");
    expect(calls.map((item) => item.tool)).toEqual([
      "request-upload-url",
      "confirm-image-upload",
      "ecommerce_save-media-library-image",
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://storage.example/put",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("creates the product hidden at wovain's price, then publishes it", async () => {
    const { call, calls } = fakeServer({
      "ecommerce_bulk-update-offer-variant-prices": { ok: true },
      "ecommerce_create-offers-from-designs": {
        results: [{ customizationId: "cus_1", offerId: "off_1" }],
      },
      "ecommerce_generate-product-design-previews": {
        results: [
          {
            customizationId: "cus_1",
            images: [{ url: "https://cdn.fourthwall.com/mock.png" }],
          },
        ],
      },
      "ecommerce_get-current-shop": { baseUrl: "https://shop.example.com" },
      "ecommerce_get-offers-by-ids": {
        offers: [{ id: "off_1", slug: "reading-cat" }],
      },
      "ecommerce_update-offer-status": { status: "PUBLIC" },
    });

    const made = await createProduct(call, {
      catalogProductId: "prd_tee",
      description: "Two lines.",
      mediaUri: "https://cdn.fourthwall.com/m/1.png",
      price: 24,
      region: "front_large",
      title: "Reading Cat Tee",
    });
    const url = await publishProduct(call, made.offerId);

    expect(made).toEqual({
      customizationId: "cus_1",
      mockups: ["https://cdn.fourthwall.com/mock.png"],
      offerId: "off_1",
    });
    expect(calls.find((item) => item.tool.includes("prices"))?.args).toEqual({
      offerId: "off_1",
      price: 24,
    });
    expect(url).toBe("https://shop.example.com/products/reading-cat");
  });

  it("stops on a bulk error", async () => {
    const { call } = fakeServer({
      "ecommerce_generate-product-design-previews": {
        results: [
          {
            bulkError: "DESIGN_PIPELINE_COLLIDING_REGIONS",
            productId: "prd_tee",
          },
        ],
      },
    });

    await expect(
      createProduct(call, {
        catalogProductId: "prd_tee",
        description: "d",
        mediaUri: "https://cdn.fourthwall.com/m/1.png",
        price: 24,
        region: "front",
        title: "t",
      })
    ).rejects.toThrow("DESIGN_PIPELINE_COLLIDING_REGIONS");
  });
});

describe("Meta", () => {
  it("stages a paused campaign with one ad per copy variant and never activates it", async () => {
    const { call, calls } = fakeServer({
      ads_create_ad: { ad_id: "ad_1", status: "PAUSED" },
      ads_create_ad_set: { ad_set_id: "as_1", status: "PAUSED" },
      ads_create_campaign: { campaign_id: "c_1", status: "PAUSED" },
      ads_create_creative: { creative_id: "cr_1" },
      ads_get_ad_account_pages: {
        pages: [{ page_id: "p_1", page_name: "Shop" }],
      },
      ads_get_ad_accounts: {
        ad_accounts: [
          { ad_account_id: "111", is_ads_mcp_enabled: false },
          { ad_account_id: "222", is_ads_mcp_enabled: true },
        ],
      },
    });

    const staged = await stagePausedCampaign(call, {
      copy: [
        { angle: "humor", headline: "Not today", message: "For quiet nights." },
        {
          angle: "gift",
          headline: "Gift a reader",
          message: "They'll love it.",
        },
      ],
      countries: ["US"],
      dailyBudgetCents: 1500,
      imageUrl: "https://cdn.fourthwall.com/mock.png",
      linkUrl: "https://shop.example.com/products/reading-cat",
      name: "wovain · Reading Cat",
      tag: "w-test",
    });

    expect(staged).toEqual({
      adAccountId: "222",
      adIds: ["ad_1", "ad_1"],
      adSetId: "as_1",
      campaignId: "c_1",
      creativeIds: ["cr_1", "cr_1"],
      pageId: "p_1",
    });
    const tools = calls.map((item) => item.tool);
    expect(tools.filter((tool) => tool === "ads_create_ad")).toHaveLength(2);
    expect(tools.some((tool) => tool.includes("activate"))).toBe(false);
    const conversations = new Set(
      calls.map((item) => item.args["client_conversation_id"])
    );
    expect(conversations.size).toBe(1);
    expect(
      calls.find((item) => item.tool === "ads_create_campaign")?.args
    ).toMatchObject({
      ad_account_id: "222",
      campaign_daily_budget: 1500,
    });
  });
});

describe("fal", () => {
  const brief = {
    artPrompt: "A sleepy cat reading under a lamp, line art",
    description: "Two lines.",
    garmentColors: ["black"],
    printedText: [],
    title: "Reading Cat Tee",
  };

  it("submits once and reads the finished job, on the merchant's fal grant", async () => {
    let checks = 0;
    const { call, calls } = fakeServer({
      check_job: () => {
        checks += 1;
        return { status: checks < 2 ? "IN_PROGRESS" : "COMPLETED" };
      },
      get_job_result: {
        data: {
          images: [
            { height: null, url: "https://v3.fal.media/a.png", width: null },
          ],
        },
      },
      submit_job: { request_id: "req_1" },
    });
    const artist = createArtist(call, async () => {
      await Promise.resolve();
    });

    const requestId = await artist.submit(brief);
    const art = await artist.result(requestId);

    expect(requestId).toBe("req_1");
    expect(art).toEqual({
      height: 2880,
      url: "https://v3.fal.media/a.png",
      width: 2880,
    });
    expect(calls.filter((item) => item.tool === "submit_job")).toHaveLength(1);
    expect(calls[0]?.args).toMatchObject({ endpoint_id: TEXT_TO_IMAGE });
  });
});
