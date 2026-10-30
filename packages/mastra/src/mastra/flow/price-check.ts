import { searchCatalog } from "@wovain/core/fourthwall";
import {
  blankVariants,
  customizationCost,
} from "@wovain/core/fourthwall-drops";
import { checkPrice } from "@wovain/core/price-check";
import type { PriceRules } from "@wovain/core/price-check";
import { pricingRules } from "@wovain/core/pricing";
import type { ToolCall } from "@wovain/core/upstream";
import { log } from "evlog";

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

// Fourthwall's cost per size; when its pricing can't be read (logged at
// error level), the blank's catalog price in each of its sizes, estimated.
// The product prints one front area, which the blank's price includes.
const costsOf = async (
  actor: Actor,
  call: ToolCall,
  row: { catalogProductId: string; customizationId: string; id: string }
) => {
  try {
    const { bySize } = await customizationCost(call, row.customizationId);
    return { bySize, estimated: false };
  } catch (error) {
    const blanks = await searchCatalog(call, {
      productId: row.catalogProductId,
    });
    const blank = blanks.find((found) => found.id === row.catalogProductId);
    if (blank?.baseCost === undefined) {
      throw new Error(
        "Neither Fourthwall's pricing nor its catalog gave a cost",
        {
          cause: error,
        }
      );
    }
    log.error({
      error: {
        code: "PRICE_CHECK_ESTIMATED",
        message: `Fourthwall's customization pricing couldn't be read, so the cost is estimated from its catalog: ${error instanceof Error ? error.message : String(error)}`,
        name: "PriceCheckEstimated",
      },
      product: { id: row.id },
      userId: actor.userId,
    });
    const { baseCost } = blank;
    const { sizes } = await blankVariants(call, blank.slug);
    return {
      bySize: Object.fromEntries(sizes.map((size) => [size, baseCost])),
      estimated: true,
    };
  }
};

export const productCosts = async (actor: Actor, productId: string) => {
  const row = await getProduct(actor, productId);
  const { bySize, estimated } = await withProvider(
    actor,
    "fourthwall",
    async (call) => await costsOf(actor, call, row)
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
