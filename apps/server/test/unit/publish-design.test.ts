import type { Design, RangeProduct } from "@wovain/shared/design";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  publishDesign,
  PublishRefusedError,
} from "../../src/lib/publish-design.ts";
import type { FourthwallCall } from "../../src/lib/publish-design.ts";
import { demoDesign } from "../helpers.ts";

const hero: Design = { ...demoDesign, id: "d1", status: "publishing" };

const mug: RangeProduct = {
  ...demoDesign,
  customizationId: "cus_mug",
  kind: "Mug",
  listing: { description: "Tea with the cat.", title: "Cat Sunset Mug" },
  quote: { ...demoDesign.quote, price: 22 },
};

const shopUrl = "https://catclub.fourthwall.com";
const ids = (value: unknown) => z.array(z.string()).parse(value);

// Fourthwall's replies as its tool descriptions document them, inside an
// envelope: results under `results`, offers under `offers`.
const fakeFourthwall = (options: { fail?: string[] } = {}) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const replies: Record<string, (args: Record<string, unknown>) => unknown> = {
    "ecommerce_create-collection": () => ({
      collection: { id: "cltn_1", offerIds: [], slug: "cat-club" },
    }),
    "ecommerce_create-offers-from-designs": (args) => ({
      results: ids(args["customizationIds"]).map((id) =>
        options.fail?.includes(id) === true
          ? { bulkError: "print area missing", customizationId: id }
          : { customizationId: id, offerId: `off_${id}` }
      ),
    }),
    "ecommerce_get-current-shop": () => ({ shop: { baseUrl: shopUrl } }),
    "ecommerce_get-offers-by-ids": (args) => ({
      offers: ids(args["offerIds"]).map((id) => ({
        id,
        slug: `slug-${id}`,
      })),
    }),
  };
  const call: FourthwallCall = async (tool, args) => {
    calls.push({ args, tool });
    return await Promise.resolve(replies[tool]?.(args) ?? { ok: true });
  };
  return { call, calls };
};

const saved: Partial<Design>[] = [];
const save = async (patch: Partial<Design>) => {
  saved.push(patch);
  await Promise.resolve();
};

describe("publishDesign", () => {
  test("a single product is created, priced, made public and linked", async () => {
    const { call, calls } = fakeFourthwall();
    const patch = await publishDesign(hero, { call, save });
    expect(calls.map((item) => item.tool)).toEqual([
      "ecommerce_get-current-shop",
      "ecommerce_create-offers-from-designs",
      "ecommerce_bulk-update-offer-variant-prices",
      "ecommerce_update-offer-status",
      "ecommerce_get-offers-by-ids",
    ]);
    expect(calls[2]?.args).toEqual({ offerId: "off_cus_1", price: 30 });
    expect(calls[3]?.args).toEqual({ offerId: "off_cus_1", status: "PUBLIC" });
    expect(patch).toEqual({
      productUrl: `${shopUrl}/products/slug-off_cus_1`,
      range: [],
    });
  });

  test("a drop prices each product and groups them in one public collection", async () => {
    const { call, calls } = fakeFourthwall();
    const patch = await publishDesign(
      { ...hero, dropName: "Cat Club", range: [mug] },
      { call, save }
    );
    expect(calls[1]?.args).toEqual({
      customizationIds: ["cus_1", "cus_mug"],
      offerDescriptions: ["Two lines.", "Tea with the cat."],
      offerNames: ["Japanese Cat Sunset Tee", "Cat Sunset Mug"],
    });
    const prices = calls
      .filter(
        (item) => item.tool === "ecommerce_bulk-update-offer-variant-prices"
      )
      .map((item) => item.args);
    expect(prices).toEqual([
      { offerId: "off_cus_1", price: 30 },
      { offerId: "off_cus_mug", price: 22 },
    ]);
    expect(
      calls.find((item) => item.tool === "ecommerce_create-collection")?.args
    ).toEqual({
      available: true,
      description: "Two lines.",
      name: "Cat Club",
      offerIds: ["off_cus_1", "off_cus_mug"],
    });
    expect(calls.at(-1)).toEqual({
      args: {
        collectionId: "cltn_1",
        shouldUpdateOffersStatus: false,
        state: "PUBLIC",
      },
      tool: "ecommerce_update-collection-state",
    });
    expect(patch).toMatchObject({
      collectionId: "cltn_1",
      productUrl: `${shopUrl}/collections/cat-club`,
      range: [
        {
          offerId: "off_cus_mug",
          productUrl: `${shopUrl}/products/slug-off_cus_mug`,
        },
      ],
    });
  });

  test("a refusal names the product and keeps what was created for the retry", async () => {
    saved.length = 0;
    const { call, calls } = fakeFourthwall({ fail: ["cus_mug"] });
    const design = { ...hero, range: [mug] };
    const failure = publishDesign(design, { call, save });
    await expect(failure).rejects.toBeInstanceOf(PublishRefusedError);
    await expect(failure).rejects.toThrow(
      "Fourthwall didn't create Cat Sunset Mug (print area missing)"
    );
    expect(saved[0]).toMatchObject({ productId: "off_cus_1" });
    expect(calls).toHaveLength(2);

    // The retry creates only the mug and reuses the tee.
    const retry = fakeFourthwall();
    await publishDesign(
      { ...design, productId: "off_cus_1" },
      { call: retry.call, save }
    );
    expect(retry.calls[1]?.args).toMatchObject({
      customizationIds: ["cus_mug"],
    });
  });

  test("a collection made on an earlier try is reused", async () => {
    const { call, calls } = fakeFourthwall();
    await publishDesign(
      {
        ...hero,
        collectionId: "cltn_old",
        productId: "off_cus_1",
        range: [{ ...mug, offerId: "off_cus_mug" }],
      },
      { call, save }
    );
    const tools = calls.map((item) => item.tool);
    expect(tools).not.toContain("ecommerce_create-offers-from-designs");
    expect(tools).not.toContain("ecommerce_create-collection");
    expect(calls.at(-1)?.args).toMatchObject({ collectionId: "cltn_old" });
  });

  test("a price Fourthwall refuses per variant stops the publish", async () => {
    const { call } = fakeFourthwall();
    const refusing: FourthwallCall = async (tool, args) =>
      tool === "ecommerce_bulk-update-offer-variant-prices"
        ? await Promise.resolve({ results: [{ bulkError: "price too low" }] })
        : await call(tool, args);
    await expect(publishDesign(hero, { call: refusing, save })).rejects.toThrow(
      "price too low"
    );
  });

  test("a create reply wovain can't read stops before saving anything", async () => {
    saved.length = 0;
    const { call } = fakeFourthwall();
    const odd: FourthwallCall = async (tool, args) =>
      tool === "ecommerce_create-offers-from-designs"
        ? await Promise.resolve({ something: "else" })
        : await call(tool, args);
    await expect(publishDesign(hero, { call: odd, save })).rejects.toThrow(
      "Couldn't read Fourthwall's reply"
    );
    expect(saved).toEqual([]);
  });

  test("no shop address stops before creating anything", async () => {
    const calls: string[] = [];
    const noShop: FourthwallCall = async (tool) => {
      calls.push(tool);
      return await Promise.resolve({});
    };
    await expect(publishDesign(hero, { call: noShop, save })).rejects.toThrow(
      "shop's address"
    );
    expect(calls).toEqual(["ecommerce_get-current-shop"]);
  });
});
