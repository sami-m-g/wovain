import { describe, expect, it } from "vitest";

import { demoCart, upstreamVariants } from "../src/lib/checkout/catalog";
import { parseVariants, quoteCheckout } from "../src/lib/checkout/quote";

describe("quoteCheckout", () => {
  it("prices the demo cart", () => {
    const quote = quoteCheckout(
      parseVariants(upstreamVariants(false)),
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
    const quote = quoteCheckout(parseVariants(upstreamVariants(false)), [
      { quantity: 1, variantId: "missing" },
    ]);
    expect(quote.lines).toStrictEqual([]);
  });
});
