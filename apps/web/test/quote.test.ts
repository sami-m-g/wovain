import { describe, expect, it } from "vitest";

import { demoCart, upstreamVariants } from "../src/lib/checkout/catalog";
import { parseVariants, quoteCheckout } from "../src/lib/checkout/quote";

describe("heal c297c104770d", () => {
  it("prices the demo cart when the upstream returns an unpriced variant", () => {
    const { rejected, variants } = parseVariants(upstreamVariants(true));
    expect(quoteCheckout(variants, demoCart).subtotal).toBe(62);
    expect(rejected).toStrictEqual([{ id: "hoodie-draft", index: 2 }]);
  });

  it("does not price a cart line for an unpriced variant", () => {
    const { variants } = parseVariants(upstreamVariants(true));
    const quote = quoteCheckout(variants, [
      { quantity: 1, variantId: "hoodie-draft" },
    ]);
    expect(quote.lines).toStrictEqual([]);
  });

  it("still rejects a payload that is not a list of variants", () => {
    expect(() => parseVariants({ variants: [] })).toThrow("expected array");
  });
});

describe("quoteCheckout", () => {
  it("prices the demo cart", () => {
    const quote = quoteCheckout(
      parseVariants(upstreamVariants(false)).variants,
      demoCart
    );
    expect(quote).toStrictEqual({
      currency: "USD",
      lines: [
        { quantity: 2, total: 48, variantId: "tee-black-m" },
        { quantity: 1, total: 14, variantId: "mug-white" },
      ],
      subtotal: 62,
    });
  });

  it("skips cart lines whose variant is gone", () => {
    const quote = quoteCheckout(
      parseVariants(upstreamVariants(false)).variants,
      [{ quantity: 1, variantId: "missing" }]
    );
    expect(quote.lines).toStrictEqual([]);
  });
});
