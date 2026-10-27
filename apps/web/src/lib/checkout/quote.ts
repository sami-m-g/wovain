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

interface RejectedVariant {
  id: string | undefined;
  index: number;
}

export interface ParsedVariants {
  rejected: RejectedVariant[];
  variants: Variant[];
}

// Keeps the variants that parse and reports the ones that don't (an unpriced
// draft variant, say), so one bad upstream row can't fail the whole quote. The
// caller must log `rejected`; a payload that isn't a list still throws.
export const parseVariants = (raw: unknown): ParsedVariants => {
  const items = z.array(z.unknown()).parse(raw);
  const variants: Variant[] = [];
  const rejected: RejectedVariant[] = [];
  for (const [index, item] of items.entries()) {
    const parsed = variantSchema.safeParse(item);
    if (parsed.success) {
      variants.push(parsed.data);
    } else {
      const id = (item as { id?: unknown } | null)?.id;
      rejected.push({ id: typeof id === "string" ? id : undefined, index });
    }
  }
  return { rejected, variants };
};

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
