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
