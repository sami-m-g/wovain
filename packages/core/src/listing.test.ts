import { describe, expect, it } from "vitest";

import {
  checkListing,
  draftListing,
  plainText,
  readListing,
  renderListing,
  writeListing,
} from "./listing";
import type { Listing } from "./listing";
import { fakeAgents } from "./test-doubles";
import type { ToolCall } from "./upstream";

const GOOD: Listing = {
  benefits: [
    "Wear the last light of a beach day all year",
    "A gift that lands with any surfer you know",
    "Bold colours that read from across the room",
  ],
  hook: "For anyone who plans their week around the evening swell.",
  title: "Retro Sunset Surf Tee with Hand-Drawn Waves",
};

const fake = (byTool: Record<string, unknown>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = (tool, args) => {
    calls.push({ args, tool });
    return Promise.resolve(byTool[tool] ?? null);
  };
  return { call, calls };
};

const OFFER = {
  offers: [
    {
      description: "<p>Old &amp; <b>plain</b></p>",
      id: "offer-1",
      name: "Sunset tee",
      shipmentStartDate: "Ships in 5-10 business days",
    },
  ],
};

describe("checkListing", () => {
  it("passes a clean listing", () => {
    expect(checkListing(GOOD)).toEqual([]);
  });

  it("flags a long or shouting title, AI tells and exclamation marks", () => {
    expect(
      checkListing({
        ...GOOD,
        benefits: [
          "It's not a shirt, it's a statement",
          "Elevate every outfit",
          "Love it!",
        ],
        title: "RETRO SUNSET SURF TEE FOR BEACH LOVERS AND SURFERS EVERYWHERE",
      })
    ).toEqual(["title_length", "title_shouting", "ai_tell", "exclamation"]);
  });

  it("flags an em dash", () => {
    expect(
      checkListing({ ...GOOD, hook: "For surfers — and their friends." })
    ).toEqual(["ai_tell"]);
  });
});

describe("renderListing", () => {
  it("escapes every line and adds the trust lines", () => {
    const html = renderListing(
      { ...GOOD, hook: "<script>alert(1)</script> & more" },
      { shipping: "Ships in 5-10 business days." }
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(html).not.toContain("<script>");
    expect(html).toContain(
      "<li>A gift that lands with any surfer you know</li>"
    );
    expect(html).toContain(
      "Printed to order, just for you. Ships in 5-10 business days."
    );
  });

  it("leaves the shipping line out when Fourthwall gives none", () => {
    expect(renderListing(GOOD, { shipping: null })).toContain(
      "<p>Printed to order, just for you.</p>"
    );
  });
});

describe("plainText", () => {
  it("drops markup and decodes entities", () => {
    expect(
      plainText("<p>Old &amp; <b>plain</b></p>\n<ul><li>x</li></ul>")
    ).toBe("Old & plain x");
  });
});

describe("Fourthwall", () => {
  it("reads the page", async () => {
    const { call } = fake({ "ecommerce_get-offers-by-ids": OFFER });
    await expect(readListing(call, "offer-1")).resolves.toEqual({
      description: "<p>Old &amp; <b>plain</b></p>",
      name: "Sunset tee",
      shipping: "Ships in 5-10 business days",
    });
  });

  it("reads the offer before it writes it", async () => {
    const { call, calls } = fake({
      "ecommerce_get-offers-by-ids": OFFER,
      "ecommerce_update-offer": { id: "offer-1" },
    });
    await writeListing(call, "offer-1", {
      description: "<p>x</p>",
      name: "New",
    });
    expect(calls.map((each) => each.tool)).toEqual([
      "ecommerce_get-offers-by-ids",
      "ecommerce_update-offer",
    ]);
    expect(calls[1]?.args).toEqual({
      description: "<p>x</p>",
      name: "New",
      offerId: "offer-1",
    });
  });

  it("refuses a product Fourthwall no longer has", async () => {
    const { call, calls } = fake({ "ecommerce_get-offers-by-ids": [] });
    await expect(
      writeListing(call, "offer-1", { description: "", name: "New" })
    ).rejects.toThrow("didn't return the product");
    expect(calls).toHaveLength(1);
  });

  it("throws Fourthwall's refusal", async () => {
    const { call } = fake({
      "ecommerce_get-offers-by-ids": OFFER,
      "ecommerce_update-offer": { bulkError: "name too long" },
    });
    await expect(
      writeListing(call, "offer-1", { description: "", name: "New" })
    ).rejects.toThrow("Fourthwall refused: name too long");
  });
});

describe("draftListing", () => {
  const input = {
    current: { description: "<p>Old</p>", name: "Sunset tee" },
    design: {
      description: "Waves at dusk.",
      printedText: [],
      title: "Sunset tee",
    },
  };

  it("keeps a first draft that passes", async () => {
    const { ask, asked } = fakeAgents({ product_listing: [GOOD] });
    await expect(draftListing(ask, input)).resolves.toEqual({
      issues: [],
      listing: GOOD,
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.prompt).toContain('"description":"Old"');
  });

  it("rewrites once with the issues, then lets the merchant decide", async () => {
    const shouting = { ...GOOD, title: "SUNSET SURF TEE NOW" };
    const { ask, asked } = fakeAgents({
      product_listing: [shouting, shouting],
    });
    await expect(draftListing(ask, input)).resolves.toEqual({
      issues: ["title_shouting"],
      listing: shouting,
    });
    expect(asked).toHaveLength(2);
    expect(asked[1]?.prompt).toContain('"issues":["title_shouting"]');
  });
});
