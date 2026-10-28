import { describe, expect, it, vi } from "vitest";

import {
  blankVariants,
  customizationCost,
  previewArgs,
  previewItem,
  searchBlanks,
} from "./fourthwall-drops";

// A tool call that always answers with this reply.
const replying = (reply: unknown) =>
  vi.fn(async () => await Promise.resolve(reply));

describe("searchBlanks", () => {
  it("keeps only the areas Fourthwall can render, with prices", async () => {
    const call = replying({
      results: [
        {
          id: "prd_1",
          name: "Heavy tee",
          priceFrom: "12.50",
          printDetails: {
            printAreas: [
              {
                name: "Back",
                placements: [],
                required: false,
                salePrice: "$8.50",
                supportsBackendRendering: true,
                type: "back_large",
              },
              {
                name: "Pocket",
                supportsBackendRendering: false,
                type: "pocket",
              },
            ],
            supportsBackendRendering: true,
          },
          slug: "heavy-tee",
        },
      ],
    });
    const [blank] = await searchBlanks(call, {
      productionMethods: ["DTG"],
      query: "tee",
    });
    expect(call).toHaveBeenCalledWith(
      "ecommerce_get-catalog-products",
      expect.objectContaining({ productionMethods: ["DTG"], query: "tee" })
    );
    expect(blank?.baseCost).toBe(12.5);
    expect(
      blank?.printAreas.map((area) => [area.type, area.salePrice])
    ).toEqual([["back_large", 8.5]]);
  });
});

describe("blankVariants", () => {
  it("returns the blank's colors and sizes verbatim", async () => {
    const call = replying([
      {
        colors: ["Black", "Bone"],
        sizes: ["S", "M", "2XL"],
        slug: "heavy-tee",
      },
    ]);
    expect(await blankVariants(call, "heavy-tee")).toEqual({
      colors: ["Black", "Bone"],
      sizes: ["S", "M", "2XL"],
    });
  });
});

describe("previewArgs", () => {
  it("sends every region, placement, size, color and size", () => {
    expect(
      previewArgs({
        colors: ["Black", "Bone"],
        productId: "prd_1",
        regions: [
          {
            fraction: 0.9,
            offset: { x: 0, y: -0.18 },
            region: "back_large",
            url: "https://cdn.test/back.png",
          },
          {
            placementId: "leftChest",
            region: "front",
            url: "https://cdn.test/mark.png",
          },
        ],
        sizes: ["S", "M"],
      })
    ).toEqual({
      colors: ["Black", "Bone"],
      fillAllPlacements: [false, false],
      placementIds: ["", "leftChest"],
      productId: "prd_1",
      regionFractions: [0.9, 1],
      regionNames: ["back_large", "front"],
      regionOffsets: [{ regionIndex: 0, x: 0, y: -0.18 }],
      regionUrls: ["https://cdn.test/back.png", "https://cdn.test/mark.png"],
      sizes: ["S", "M"],
    });
  });

  it("throws Fourthwall's refusal", async () => {
    const call = replying([{ bulkError: "COLLIDING_REGIONS" }]);
    await expect(
      previewItem(call, { colors: [], productId: "p", regions: [], sizes: [] })
    ).rejects.toThrow(/COLLIDING_REGIONS/u);
  });
});

describe("customizationCost", () => {
  it("reads the costliest size", async () => {
    const call = replying({
      costs: [
        { size: "M", totalCost: { amount: 21.4, currency: "USD" } },
        { size: "2XL", totalCost: { amount: 23.9, currency: "USD" } },
      ],
    });
    expect(await customizationCost(call, "cus_1")).toEqual({
      bySize: { "2XL": 23.9, M: 21.4 },
      max: 23.9,
    });
  });

  it("fails when the reply has no cost", async () => {
    const call = replying({ sizes: ["M"] });
    await expect(customizationCost(call, "cus_1")).rejects.toThrow(
      /no cost per size/u
    );
  });
});
