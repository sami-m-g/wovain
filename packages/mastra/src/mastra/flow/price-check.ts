import { customizationCost } from "@wovain/core/fourthwall-drops";
import { checkPrice } from "@wovain/core/price-check";
import type { PriceRules } from "@wovain/core/price-check";
import { pricingRules } from "@wovain/core/pricing";

import type { Actor } from "./actor";
import { withProvider } from "./connections";
import { getProduct } from "./products";

// The Store's price check (openspec store-management): what Fourthwall
// charges to make a product in each size, and the pricing rules, so the
// reprice dialog shows profit and margin per size as the merchant types.

const priceRules = (): PriceRules => {
  const rules = pricingRules();
  return {
    cardFeeFixed: rules.cardFeeFixed,
    cardFeePct: rules.cardFeePct,
    minMarginPct: rules.minMarginPct,
    minProfit: rules.minProfit,
    refundReservePct: rules.refundReservePct,
    salesTaxPct: rules.salesTaxPct,
    shipping: rules.shipping,
    sizeSurcharges: rules.sizeSurcharges ?? {},
  };
};

export const productCosts = async (actor: Actor, productId: string) => {
  const row = await getProduct(actor, productId);
  const { bySize } = await withProvider(
    actor,
    "fourthwall",
    async (call) => await customizationCost(call, row.customizationId)
  );
  const rules = priceRules();
  return {
    check: checkPrice(rules, row.price, bySize) ?? null,
    costs: bySize,
    price: row.price,
    rules,
  };
};

// The check at a new price, for refusing one that sells at a loss.
export const checkNewPrice = async (
  actor: Actor,
  productId: string,
  price: number
) => {
  const { costs, rules } = await productCosts(actor, productId);
  return checkPrice(rules, price, costs);
};
