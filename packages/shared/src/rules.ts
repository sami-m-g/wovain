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

// Meta's Ad Rules Engine payload (POST act_{id}/adrules_library). Money is in
// cents; filters and actions follow developers.facebook.com/docs/marketing-api/ad-rules.
interface Filter {
  field: string;
  operator: string;
  value: unknown;
}
export interface MetaRule {
  evaluation_spec: { evaluation_type: "SCHEDULE"; filters: Filter[] };
  execution_spec: {
    execution_options?: Filter[];
    execution_type: "PAUSE" | "NOTIFICATION" | "CHANGE_CAMPAIGN_BUDGET";
  };
  // wovain's label, kept apart from the name Meta shows.
  label: RuleLabel;
  name: string;
  schedule_spec: { schedule_type: "SEMI_HOURLY" | "HOURLY" | "DAILY" };
}

export const ruleLabels = [
  "Kill, no sales",
  "Kill, design",
  "Kill, too expensive",
  "Scale",
  "Alert",
] as const;
export type RuleLabel = (typeof ruleLabels)[number];

export interface RuleProduct {
  breakevenPerSale: number;
  designId: string;
}

// Ads are named "wovain d1 · A", so a name filter finds one product's ads.
export const adName = (designId: string, slot: string) =>
  `wovain ${designId} · ${slot}`;

const cents = (dollars: number) => Math.round(dollars * 100);
const is = (field: string, value: unknown, operator = "EQUAL"): Filter => ({
  field,
  operator,
  value,
});
const PURCHASES = "offsite_conversion.fb_pixel_purchase";
const COST_PER_SALE = "cost_per_purchase_fb";

export const metaRules = ({
  campaignId,
  dailyBudget,
  products,
  rules,
}: {
  campaignId: string;
  dailyBudget: number;
  products: RuleProduct[];
  rules: Settings["rules"];
}): MetaRule[] => {
  const killSchedule = {
    schedule_type: rules.killCheckMinutes < 60 ? "SEMI_HOURLY" : "HOURLY",
  } as const;
  const inCampaign = is("campaign.id", [campaignId], "IN");
  const name = (label: string, designId?: string) =>
    `wovain ${campaignId}${designId === undefined ? "" : ` ${designId}`} · ${label}`;

  const perProduct = products.flatMap(({ breakevenPerSale, designId }) => {
    const t = ruleThresholds(breakevenPerSale, rules);
    const ads = [
      is("entity_type", "AD"),
      inCampaign,
      is("ad.name", `wovain ${designId} ·`, "CONTAIN"),
    ];
    return [
      {
        evaluation_spec: {
          evaluation_type: "SCHEDULE" as const,
          filters: [
            ...ads,
            is("time_preset", "LIFETIME"),
            is("spent", cents(t.killNoSalesAt), "GREATER_THAN"),
            is(PURCHASES, 1, "LESS_THAN"),
          ],
        },
        execution_spec: { execution_type: "PAUSE" as const },
        label: "Kill, no sales" as const,
        name: name("Kill, no sales", designId),
        schedule_spec: killSchedule,
      },
      {
        evaluation_spec: {
          evaluation_type: "SCHEDULE" as const,
          filters: [
            ...ads,
            is("time_preset", "LAST_7D"),
            is(COST_PER_SALE, cents(t.killExpensiveAbove), "GREATER_THAN"),
            is(PURCHASES, rules.killExpensiveMinSales - 1, "GREATER_THAN"),
          ],
        },
        execution_spec: { execution_type: "PAUSE" as const },
        label: "Kill, too expensive" as const,
        name: name("Kill, too expensive", designId),
        schedule_spec: killSchedule,
      },
    ];
  });

  // Meta rules judge one ad, ad set or campaign at a time and can't add up a
  // subset of ads, so the design kill runs on the campaign when it holds a
  // single product. With more products, the check-in covers it (slice 6).
  const [only] = products;
  const designKill =
    products.length === 1 && only !== undefined
      ? [
          {
            evaluation_spec: {
              evaluation_type: "SCHEDULE" as const,
              filters: [
                is("entity_type", "CAMPAIGN"),
                inCampaign,
                is("time_preset", "LIFETIME"),
                is(
                  "spent",
                  cents(
                    ruleThresholds(only.breakevenPerSale, rules).killDesignAt
                  ),
                  "GREATER_THAN"
                ),
                is(PURCHASES, 1, "LESS_THAN"),
              ],
            },
            execution_spec: { execution_type: "PAUSE" as const },
            label: "Kill, design" as const,
            name: name("Kill, design", only.designId),
            schedule_spec: killSchedule,
          },
        ]
      : [];

  // Campaign-wide rules use the lowest breakeven, the strictest product.
  const lowest = Math.min(...products.map((p) => p.breakevenPerSale));
  const campaign = ruleThresholds(lowest, rules);
  const campaignFilters = [is("entity_type", "CAMPAIGN"), inCampaign];
  return [
    ...perProduct,
    ...designKill,
    {
      evaluation_spec: {
        evaluation_type: "SCHEDULE",
        filters: [
          ...campaignFilters,
          is("time_preset", "LAST_3D"),
          is(COST_PER_SALE, cents(campaign.scaleUnder), "LESS_THAN"),
          is(PURCHASES, rules.scaleMinSales - 1, "GREATER_THAN"),
        ],
      },
      execution_spec: {
        execution_options: [
          is("change_spec", {
            amount: rules.scaleStepPct,
            limit: cents(dailyBudget * rules.scaleCapMultiple),
            unit: "PERCENTAGE",
          }),
          is("action_frequency", rules.scaleEveryHours * 60),
        ],
        execution_type: "CHANGE_CAMPAIGN_BUDGET",
      },
      label: "Scale",
      name: name("Scale"),
      schedule_spec: { schedule_type: "DAILY" },
    },
    {
      evaluation_spec: {
        evaluation_type: "SCHEDULE",
        filters: [
          ...campaignFilters,
          is("time_preset", "LAST_7D"),
          is(COST_PER_SALE, cents(campaign.alertAbove), "GREATER_THAN"),
        ],
      },
      execution_spec: { execution_type: "NOTIFICATION" },
      label: "Alert",
      name: name("Alert"),
      schedule_spec: { schedule_type: "DAILY" },
    },
  ];
};
