import type { Settings } from "./settings.ts";

// The five campaign rules (prd.md > Campaign rules), as dollar thresholds for
// one product. The ad card shows them; the campaign step creates them in Meta.
export interface RuleThresholds {
  // Alert when campaign cost per sale goes above breakeven.
  alertAbove: number;
  // Pause all of a product's ads when their spend reaches this with no sales.
  killDesignAt: number;
  // Pause an ad whose cost per sale is above this once it has enough sales.
  killExpensiveAbove: number;
  // Pause an ad when its spend reaches this with no sales.
  killNoSalesAt: number;
  // Raise the campaign budget when cost per sale stays under this.
  scaleUnder: number;
}

export const ruleThresholds = (
  breakevenPerSale: number,
  rules: Settings["rules"]
): RuleThresholds => ({
  alertAbove: breakevenPerSale,
  killDesignAt: breakevenPerSale * rules.killDesignMultiple,
  killExpensiveAbove: breakevenPerSale * rules.killExpensiveMultiple,
  killNoSalesAt: breakevenPerSale * rules.killNoSalesMultiple,
  scaleUnder: breakevenPerSale * rules.scaleUnderMultiple,
});
