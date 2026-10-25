// A product's price from its base cost: at least the minimum profit or the
// minimum margin, whichever is greater, rounded up to a whole dollar that
// still clears the minimum profit after card fees, sales tax on the order
// and a refund reserve. Amounts are dollars.

export const PRICING = {
  cardFeeFixed: 0.3,
  cardFeePct: 2.9,
  minMarginPct: 30,
  minProfit: 10,
  refundReservePct: 2,
  salesTaxPct: 7,
  shipping: 5,
} as const;

// A typical tee's base cost when the catalog doesn't say.
export const DEFAULT_BASE_COST = 12;

const percent = (value: number) => value / 100;

// What a sale leaves after the blank, fees and the refund reserve.
export const profitPerSale = (price: number, baseCost: number) => {
  const tax = price * percent(PRICING.salesTaxPct);
  const orderValue = price + PRICING.shipping + tax;
  const cardFees =
    orderValue * percent(PRICING.cardFeePct) + PRICING.cardFeeFixed;
  return (
    price - baseCost - cardFees - price * percent(PRICING.refundReservePct)
  );
};

export const priceFor = (baseCost: number) => {
  const floor = Math.max(
    baseCost + PRICING.minProfit,
    baseCost / (1 - percent(PRICING.minMarginPct))
  );
  let price = Math.ceil(floor);
  while (profitPerSale(price, baseCost) < PRICING.minProfit) {
    price += 1;
  }
  return price;
};
