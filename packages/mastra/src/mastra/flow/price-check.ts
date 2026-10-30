import { customizationCost } from "@wovain/core/fourthwall-drops";
import { checkPrice } from "@wovain/core/price-check";
import type { PriceRules } from "@wovain/core/price-check";
import { pricingRules } from "@wovain/core/pricing";
import type { ToolCall } from "@wovain/core/upstream";
import { log } from "evlog";

import type { Actor } from "./actor";
import { withProvider } from "./connections";
import { estimatedCost, itemStateOf, regionsOf } from "./drops";
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

// Fourthwall's cost per size; when its pricing can't be read (logged at
// error level), a drop's product gets the catalog estimate in every size.
const costsOf = async (
  actor: Actor,
  call: ToolCall,
  productId: string,
  customizationId: string
) => {
  try {
    const { bySize } = await customizationCost(call, customizationId);
    return { bySize, estimated: false };
  } catch (error) {
    const item = await actor.db.query.dropItem.findFirst({
      where: { productId },
    });
    if (item === undefined) {
      throw error;
    }
    log.error({
      error: {
        code: "PRICE_CHECK_ESTIMATED",
        message: `Fourthwall's customization pricing couldn't be read, so the cost is estimated from its catalog: ${error instanceof Error ? error.message : String(error)}`,
        name: "PriceCheckEstimated",
      },
      product: { id: productId },
      userId: actor.userId,
    });
    const regions = regionsOf(item).map(([region]) => region);
    const dollars = await estimatedCost(call, item, regions, error);
    const { sizes } = itemStateOf(item);
    return {
      bySize: Object.fromEntries(sizes.map((size) => [size, dollars])),
      estimated: true,
    };
  }
};

export const productCosts = async (actor: Actor, productId: string) => {
  const row = await getProduct(actor, productId);
  const { bySize, estimated } = await withProvider(
    actor,
    "fourthwall",
    async (call) => await costsOf(actor, call, productId, row.customizationId)
  );
  const rules = priceRules();
  return {
    check: checkPrice(rules, row.price, bySize) ?? null,
    costs: bySize,
    estimated,
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
