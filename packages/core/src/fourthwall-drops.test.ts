import { log as evlog } from "evlog";
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

describe("searchBlanks with an odd reply", () => {
  it("keeps a blank whose optional fields are spelled another way", async () => {
    const call = replying({
      results: [
        {
          id: "prd_2",
          name: "Classic tee",
          priceFrom: { currency: "USD", value: "12.50" },
          printDetails: {
            printAreas: [
              {
                name: "Front",
                placements: [{ id: "center" }],
                salePrice: { formatted: "$8.50" },
                supportsBackendRendering: true,
                type: "front_large",
              },
            ],
            supportsBackendRendering: true,
          },
          slug: "classic-tee",
        },
      ],
    });
    const [blank] = await searchBlanks(call, { query: "tee" });
    expect(blank?.id).toBe("prd_2");
    expect(blank?.baseCost).toBe(12.5);
    expect(blank?.printAreas[0]?.placements).toEqual([]);
  });

  it("logs the shape of a reply with nothing to print on, not its values", async () => {
    const error = vi.spyOn(evlog, "error").mockImplementation(() => {});
    const blanks = await searchBlanks(
      replying({ content: [{ secret: "shop-data", total: 0 }] }),
      { query: "tee" }
    );
    expect(blanks).toEqual([]);
    const [[logged]] = error.mock.calls as [
      [{ error: { code: string; message: string } }],
    ];
    expect(logged.error.code).toBe("FOURTHWALL_CATALOG_EMPTY");
    expect(logged.error.message).toContain(
      "shape={content:[1x{secret:string,total:number}]}"
    );
    expect(logged.error.message).not.toContain("shop-data");
    error.mockRestore();
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

  // The reply logged on next (#346): shape={pricing:[1x{priceRange:null,
  // perSize:[7x{size:string,costComponents:[1],cost:{...}}],
  // numberOfUnits:number}]}. Its cost is an object, never a bare number.
  it.each([
    [
      "Money with a string value",
      (value: number) => ({ currency: "USD", value: value.toFixed(2) }),
    ],
    [
      "parts and a total",
      (value: number) => ({
        base: { amount: 1 },
        total: { currency: "USD", value },
      }),
    ],
  ])("reads perSize[].cost as %s", async (_name, cost) => {
    const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
    const call = replying({
      pricing: [
        {
          numberOfUnits: 1,
          perSize: sizes.map((size, index) => ({
            cost: cost(20 + index),
            costComponents: [{ cost: cost(5), name: "front_large" }],
            size,
          })),
          priceRange: null,
        },
      ],
    });
    const { bySize, max } = await customizationCost(call, "cus_1");
    expect(bySize.XS).toBe(20);
    expect(max).toBe(26);
  });

  it("fails when the reply has no cost", async () => {
    const call = replying({ sizes: ["M"] });
    await expect(customizationCost(call, "cus_1")).rejects.toThrow(
      /no cost per size: shape=\{sizes:\[1xstring\]\}/u
    );
  });
});
