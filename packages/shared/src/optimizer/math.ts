// Paid-media math, ported from claude-ads' `ads-math` (MIT, see NOTICE).
// Every ratio returns undefined when its denominator is zero or negative, so no
// division by zero hides inside a number. Shop (Fourthwall) and
// platform-attributed (Meta) figures are inputs to separate calls, never added.

export const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : undefined;

// Cost per acquisition: spend over sales (net sales or Meta purchases, never both).
export const cpa = (spend: number, sales: number) => ratio(spend, sales);

export const roas = (revenue: number, spend: number) => ratio(revenue, spend);

// Click-through rate and hook rate as fractions of impressions.
export const ctr = (clicks: number, impressions: number) =>
  ratio(clicks, impressions);
export const hookRate = (plays3s: number, impressions: number) =>
  ratio(plays3s, impressions);

export const cpm = (spend: number, impressions: number) => {
  const perImpression = ratio(spend, impressions);
  return perImpression === undefined ? undefined : perImpression * 1000;
};

// Break-even CPA is the profit one sale leaves before ads; break-even ROAS is
// price over that profit (economics.ts `breakeven` already carries both).
export const breakevenRoas = (price: number, perSale: number) =>
  ratio(price, perSale);

// The cost of the next sale: extra spend over extra sales between two windows.
export const marginalCpa = (
  spend: { after: number; before: number },
  sales: { after: number; before: number }
) => ratio(spend.after - spend.before, sales.after - sales.before);

// What ads leave after their own spend and the cost of reversed orders.
export const contribution = ({
  netSales,
  perSale,
  reversalCost = 0,
  spend,
}: {
  netSales: number;
  perSale: number;
  reversalCost?: number;
  spend: number;
}) => netSales * perSale - spend - reversalCost;

export interface Cases {
  base: number;
  downside: number;
  upside?: number;
}

export const mean = (values: number[]) =>
  ratio(
    values.reduce((sum, value) => sum + value, 0),
    values.length
  );

// The relative change from `before` to `after` (0.3 is up 30%).
export const change = (before: number, after: number) => {
  const relative = ratio(after, before);
  return relative === undefined ? undefined : relative - 1;
};
