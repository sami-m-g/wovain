import { randomBytes } from "node:crypto";

import { EvlogError } from "evlog";
import { describe, expect, it, vi } from "vitest";

import { searchCatalog } from "./fourthwall";
import { external } from "./log";
import { createSealer } from "./sealing";
import { resultData, toonFailure } from "./upstream";

describe("external", () => {
  it("logs each call and turns a failure into a structured provider error", async () => {
    const set = vi.fn();

    await expect(
      external(
        { set },
        { operation: "search", provider: "tavily" },
        async () => await Promise.reject(new Error("429 Too Many Requests"))
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "TAVILY_FAILED" &&
        error.status === 502 &&
        error.why === "429 Too Many Requests"
    );
    expect(set).toHaveBeenCalledWith({
      external: [
        expect.objectContaining({
          ok: false,
          operation: "search",
          provider: "tavily",
        }),
      ],
    });
  });

  it("keeps the provider's status and words in the message", async () => {
    const refused = Object.assign(new Error("invalid_token"), { status: 401 });

    await expect(
      external(
        undefined,
        { operation: "submit_job", provider: "fal" },
        async () => await Promise.reject(refused)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.message === "fal submit_job failed: 401 invalid_token" &&
        error.why === "401 invalid_token"
    );
  });

  it("makes a provider's spent plan a 4xx, so the run fails at once", async () => {
    // Tavily's SDK throws a plain Error with only these words.
    const spent = new Error(
      "This request exceeds your plan's set usage limit. Please upgrade your plan or contact support@tavily.com"
    );

    await expect(
      external(
        undefined,
        { operation: "search", provider: "tavily" },
        async () => await Promise.reject(spent)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "TAVILY_FAILED" &&
        error.status === 402
    );
  });

  it("makes fal's exhausted balance a 4xx, so the run fails at once", async () => {
    // fal's client keeps the reason only in the 403 body's detail.
    const locked = Object.assign(new Error("Forbidden"), {
      body: {
        detail:
          "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.",
      },
      status: 403,
    });

    await expect(
      external(
        undefined,
        { operation: "submit_art", provider: "fal" },
        async () => await Promise.reject(locked)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "FAL_FAILED" &&
        error.status === 402 &&
        error.message.includes("Exhausted balance")
    );
  });

  it("passes a result through and records success", async () => {
    const set = vi.fn();
    const value = await external(
      { set },
      { operation: "taste", provider: "qloo" },
      async () => await Promise.resolve(42)
    );
    expect(value).toBe(42);
    expect(set).toHaveBeenCalledWith({
      external: [expect.objectContaining({ ok: true, provider: "qloo" })],
    });
  });
});

describe("sealing", () => {
  const sealer = createSealer(randomBytes(32).toString("base64"));

  it("opens what it sealed for the same owner and provider", () => {
    const sealed = sealer.seal('{"access_token":"t"}', "u1:meta");
    expect(sealed).not.toContain("access_token");
    expect(sealer.open(sealed, "u1:meta")).toBe('{"access_token":"t"}');
  });

  it("refuses a ciphertext moved to another row", () => {
    const sealed = sealer.seal("secret", "u1:meta");
    expect(() => sealer.open(sealed, "u2:meta")).toThrow();
  });

  it("rejects a key that isn't 32 bytes", () => {
    expect(() => createSealer("c2hvcnQ=")).toThrow("32 bytes");
  });
});

describe("resultData", () => {
  it("prefers structured content, then JSON text, and surfaces tool errors", () => {
    expect(resultData({ content: [], structuredContent: { a: 1 } })).toEqual({
      a: 1,
    });
    expect(
      resultData({ content: [{ text: '{"b":2}', type: "text" }] })
    ).toEqual({ b: 2 });
    expect(() =>
      resultData({
        content: [{ text: "Offer not found", type: "text" }],
        isError: true,
      })
    ).toThrow("Offer not found");
  });

  it("decodes Fourthwall's array fields with the header on its own line", async () => {
    // Fourthwall's reply on next, 2026-10-30 (the logged text up to
    // "badg"), with printDetails in the same encoding.
    const text = [
      "pageNumber: 0",
      "pageSize: 10",
      "totalElements: 72",
      "totalPages: 8",
      "data[10]:",
      "  - id: pro_8be1acca2fe7403f89",
      "    brand: Comfort Colors",
      '    brandModel: "1717"',
      "    name: Comfort Colors Garment-Dyed Heavyweight T-Shirt",
      "    slug: comfort-colors-garment-dyed-heavyweight-t-shirt-dtg",
      "    categoryPath:",
      "    [2]: Apparel,T-Shirts",
      "    productionMethod: DTG",
      "    priceFrom: 15.45",
      "    priceTo: 46.77",
      "    minimumOrdersNumber: 0",
      "    reviewsSummary:",
      "        count: 261",
      "        rating: 4.66",
      "    customizationType: DESIGNER_V3_READY",
      "    favourite: false",
      "    printDetails:",
      "        supportsBackendRendering: true",
      "        printAreas:",
      "        [2]{name,type,supportsBackendRendering}:",
      "            Front,front_large,true",
      "            Back,back_large,true",
    ].join("\n");
    const reply = resultData({ content: [{ text, type: "text" }] });
    expect(toonFailure(text)).toBe("");
    await expect(searchCatalog(() => Promise.resolve(reply))).resolves.toEqual([
      {
        baseCost: 15.45,
        id: "pro_8be1acca2fe7403f89",
        name: "Comfort Colors Garment-Dyed Heavyweight T-Shirt",
        region: "front_large",
        slug: "comfort-colors-garment-dyed-heavyweight-t-shirt-dtg",
      },
    ]);
  });

  it("decodes Fourthwall's TOON catalog into renderable blanks", async () => {
    const text = [
      "pageNumber: 0",
      "pageSize: 10",
      "totalElements: 72",
      "totalPages: 8",
      "data[1]:",
      "  - id: pro_8be1acca2fe7403f89",
      "    brand: Comfort Colors",
      "    name: Garment-Dyed Heavyweight T-Shirt",
      "    slug: comfort-colors-1717",
      "    priceFrom:",
      "      value: 14.5",
      "      currency: USD",
      "    printDetails:",
      "      supportsBackendRendering: true",
      "      printAreas[2]{name,type,supportsBackendRendering}:",
      "        Front,front_large,true",
      "        Back,back_large,true",
    ].join("\n");
    const reply = resultData({ content: [{ text, type: "text" }] });
    await expect(searchCatalog(() => Promise.resolve(reply))).resolves.toEqual([
      {
        baseCost: 14.5,
        id: "pro_8be1acca2fe7403f89",
        name: "Garment-Dyed Heavyweight T-Shirt",
        region: "front_large",
        slug: "comfort-colors-1717",
      },
    ]);
  });

  it("decodes TOON leniently and says why text didn't decode", () => {
    const text = "data[2]:\n  - id: a\n    name: Tee";
    expect(resultData({ content: [{ text, type: "text" }] })).toEqual({
      data: [{ id: "a", name: "Tee" }],
    });
    expect(toonFailure('id: a\nname: "Tee')).toContain("toon_error=");
    expect(toonFailure({ id: "a" })).toBe("");
  });

  it("reads the text when the structured money has no amount", () => {
    // Fourthwall's pricing reply on next: structured money without its amount.
    const amountless = {
      currency: "USD",
      currencyScale: 2,
      isZero: false,
    };
    const structuredContent = {
      pricing: [{ perSize: [{ cost: amountless, size: "M" }] }],
    };
    const text = JSON.stringify({
      pricing: [
        { perSize: [{ cost: { currency: "USD", value: 21.4 }, size: "M" }] },
      ],
    });
    expect(
      resultData({ content: [{ text, type: "text" }], structuredContent })
    ).toEqual(JSON.parse(text));
    expect(
      resultData({
        content: [{ text: "Done", type: "text" }],
        structuredContent,
      })
    ).toBe(structuredContent);
  });

  it("keeps prose that isn't JSON or TOON as text", () => {
    expect(
      resultData({ content: [{ text: "Product created", type: "text" }] })
    ).toBe("Product created");
  });
});
