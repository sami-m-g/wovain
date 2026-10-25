import { z } from "zod";

// Prices a checkout from the store's product variants, as the storefront's
// upstream (Fourthwall) returns them. The self-healing demo (docs/flows.md)
// breaks this path on purpose: with the fault-injection-checkout flag on, the
// catalog includes a variant the upstream returns without a price.

const variantSchema = z.object({
  currency: z.string().length(3),
  id: z.string(),
  name: z.string(),
  price: z.object({ amount: z.number().nonnegative() }),
});
export type Variant = z.infer<typeof variantSchema>;

export interface CartLine {
  variantId: string;
  quantity: number;
}

export interface Quote {
  currency: string;
  lines: { variantId: string; quantity: number; total: number }[];
  subtotal: number;
}

export const parseVariants = (raw: unknown): Variant[] =>
  z.array(variantSchema).parse(raw);

export const quoteCheckout = (variants: Variant[], cart: CartLine[]): Quote => {
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines = cart.flatMap((line) => {
    const variant = byId.get(line.variantId);
    return variant === undefined
      ? []
      : [
          {
            quantity: line.quantity,
            total: variant.price.amount * line.quantity,
            variantId: line.variantId,
          },
        ];
  });
  return {
    currency: variants[0]?.currency ?? "USD",
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.total, 0),
  };
};
