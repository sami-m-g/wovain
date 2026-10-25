import type { CartLine } from "./quote";

// A fixed demo catalog and cart, shaped like the upstream's variants response.
// With the fault injected, one variant comes back without a price, as an
// unpriced draft variant does upstream.

const PRICED = [
  {
    currency: "USD",
    id: "tee-black-m",
    name: "Tee, black, M",
    price: { amount: 24 },
  },
  {
    currency: "USD",
    id: "mug-white",
    name: "Mug, white",
    price: { amount: 14 },
  },
];
const UNPRICED = {
  currency: "USD",
  id: "hoodie-draft",
  name: "Hoodie (draft)",
  price: null,
};

export const demoCart: CartLine[] = [
  { quantity: 2, variantId: "tee-black-m" },
  { quantity: 1, variantId: "mug-white" },
];

export const upstreamVariants = (faultInjected: boolean): unknown[] =>
  faultInjected ? [...PRICED, UNPRICED] : PRICED;
