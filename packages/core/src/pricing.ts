import { z } from "zod";

// A product's price from its base cost: at least the minimum profit or the
// minimum margin, whichever is greater, rounded up to a whole dollar that
// still clears the minimum profit after card fees, sales tax on the order
// and a refund reserve. Amounts are dollars. The rules change per
// environment without a code change, so they are the PRICING_RULES env var
// (JSON, set from Pulumi config: `pricingRules` in infra/Pulumi.<stack>.yaml).

const dollars = z.number().nonnegative();
const pct = z.number().min(0).max(100);

export const pricingRulesSchema = z.strictObject({
  cardFeeFixed: dollars,
  cardFeePct: pct,
  // A typical tee's base cost, when the catalog doesn't say.
  defaultBaseCost: dollars.positive(),
  minMarginPct: pct.max(99),
  minProfit: dollars,
  refundReservePct: pct,
  salesTaxPct: pct,
  shipping: dollars,
  // Optional: dollars added to the price of larger sizes, which cost more
  // to make, e.g. { "2XL": 2, "3XL": 4 }. Absent, every size has one price.
  sizeSurcharges: z.record(z.string().min(1), dollars).optional(),
});

export type PricingRules = z.infer<typeof pricingRulesSchema>;

export const PRICING_RULES_VAR = "PRICING_RULES";

// The rules from their JSON. A missing or invalid value throws, naming the
// variable: there is no default to fall back to.
export const parsePricingRules = (raw?: string): PricingRules => {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `${PRICING_RULES_VAR} is not set: it holds the pricing rules (apps/web/.env.schema)`
    );
  }
  const parsed = pricingRulesSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${PRICING_RULES_VAR} is invalid: ${z.prettifyError(parsed.error)}`
    );
  }
  return parsed.data;
};

let loaded: PricingRules | undefined;

// This process's rules, read from the environment once.
export const pricingRules = (): PricingRules => {
  loaded ??= parsePricingRules(process.env[PRICING_RULES_VAR]);
  return loaded;
};

const percent = (value: number) => value / 100;

// What a sale leaves after the blank, fees and the refund reserve.
export const profitPerSale = (price: number, baseCost: number) => {
  const rules = pricingRules();
  const tax = price * percent(rules.salesTaxPct);
  const orderValue = price + rules.shipping + tax;
  const cardFees = orderValue * percent(rules.cardFeePct) + rules.cardFeeFixed;
  return price - baseCost - cardFees - price * percent(rules.refundReservePct);
};

export const priceFor = (baseCost: number) => {
  const rules = pricingRules();
  const floor = Math.max(
    baseCost + rules.minProfit,
    baseCost / (1 - percent(rules.minMarginPct))
  );
  let price = Math.ceil(floor);
  while (profitPerSale(price, baseCost) < rules.minProfit) {
    price += 1;
  }
  return price;
};

// The price of each surcharged size, from the product's base price. Sizes
// without a surcharge keep the base price, so they are not listed.
export const sizePrices = (
  price: number,
  surcharges: Record<string, number> = pricingRules().sizeSurcharges ?? {}
) =>
  Object.entries(surcharges)
    .filter(([, extra]) => extra > 0)
    .map(([size, extra]) => ({ price: price + extra, size }));

// The most a blank could have cost for wovain to have priced it at `price`:
// prices are the cost-plus floor (priceFor), so this bounds the base cost
// when only the price is known. Searched to the cent.
export const baseCostCeiling = (price: number) => {
  let low = 0;
  let high = price;
  const CENT = 0.01;
  while (high - low > CENT) {
    const mid = (low + high) / 2;
    if (priceFor(mid) <= price) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
};

// Whether a percentage discount keeps every sale of this price from losing
// money: the profit left after the discount, fees and the refund reserve,
// at the highest base cost the price allows, is not below zero.
export const discountKeepsProfit = (price: number, percentage: number) =>
  profitPerSale(price * (1 - percent(percentage)), baseCostCeiling(price)) >= 0;
