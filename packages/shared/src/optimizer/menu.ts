import { createHash } from "node:crypto";

import { ruleThresholds } from "../rules.ts";
import type { Settings } from "../settings.ts";
import { ratio } from "./math.ts";
import { isKillBlocked } from "./reconcile.ts";
import { entityKey, findingKey } from "./records.ts";
import type {
  ActionType,
  Block,
  Candidate,
  Entity,
  Finding,
  FindingPattern,
  Impact,
  Risk,
} from "./records.ts";

// The candidate menu (spec section 3, Decide): code builds every action, with
// its amount, target, expected impact, risk, window and rollback. The model
// only ranks and explains what's on it.

const HOURS_PER_DAY = 24;
const KILLS = new Set<ActionType>(["pause_ad", "pause_design", "budget_down"]);

// A kill judged on sales counts; operations pauses rest on Fourthwall facts.
export const isKill = (candidate: Pick<Candidate, "rule" | "type">) =>
  KILLS.has(candidate.type) && !candidate.rule.startsWith("POD-O");

export interface MenuContext {
  // The entities above each target (its design, campaign and the shop).
  ancestorsOf: (entity: Entity) => Entity[];
  blocks: Block[];
  // The day the menu is for: one idempotency key per action per day.
  day: string;
  settings: Settings;
}

interface Draft {
  amount?: number | undefined;
  impact: Impact;
  risk: Risk;
  rollback?: ActionType;
  status?: "ACTIVE" | "PAUSED";
  type: ActionType;
  windowDays?: number;
}

const none: Impact = { base: 0, downside: 0, unit: "none" };
const fact = (finding: Finding, key: string) => finding.facts[key] ?? 0;

// Spend saved over the window; the downside loses one sale's profit.
const pauseImpact = (finding: Finding, days: number): Impact => {
  const saved = fact(finding, "spendPerDay") * days;
  return {
    base: saved,
    downside: saved - fact(finding, "perSale"),
    unit: "usd",
  };
};

// Extra sales at the marginal CPA; the downside assumes it's 50% worse.
const budgetUp = (finding: Finding, settings: Settings): Draft => {
  const budget = fact(finding, "dailyBudget");
  const extra = (budget * settings.optimizer.maxBudgetChangePctPerDay) / 100;
  const perSale = fact(finding, "perSale");
  const marginal = fact(finding, "marginalCpa");
  const profitAt = (cost: number) =>
    (ratio(extra, cost) ?? 0) * perSale - extra;
  return {
    amount: budget + extra,
    impact: {
      base: profitAt(marginal),
      downside: profitAt(marginal * 1.5),
      unit: "usd_per_day",
    },
    risk: "safe",
    rollback: "budget_down",
    type: "budget_up",
    windowDays: 7,
  };
};

const budgetDown = (finding: Finding, settings: Settings): Draft => {
  const budget = fact(finding, "dailyBudget");
  const cut = (budget * settings.optimizer.maxBudgetChangePctPerDay) / 100;
  const salesLost = ratio(cut, fact(finding, "marginalCpa")) ?? 0;
  return {
    amount: budget - cut,
    impact: {
      base: cut - salesLost * fact(finding, "perSale") * 0.5,
      downside: cut - salesLost * fact(finding, "perSale"),
      unit: "usd_per_day",
    },
    risk: "safe",
    rollback: "budget_up",
    type: "budget_down",
    windowDays: 7,
  };
};

// The new breakeven and kill line at the suggested price (POD-E2, POD-E3).
const priceChange = (finding: Finding, settings: Settings): Draft => {
  const perSale = fact(finding, "newPerSale");
  return {
    amount: fact(finding, "suggestedPrice"),
    impact: {
      base: perSale - fact(finding, "realized"),
      downside: 0,
      note: `New breakeven ${perSale.toFixed(2)}, kill line ${ruleThresholds(perSale, settings.rules).killNoSalesAt.toFixed(2)}`,
      unit: "usd",
    },
    risk: "risky",
    type: "price_change",
    windowDays: 14,
  };
};

const advice = (type: ActionType, windowDays?: number): Draft => ({
  impact: none,
  risk: "advice",
  type,
  ...(windowDays === undefined ? {} : { windowDays }),
});

const refresh: Draft = {
  impact: {
    ...none,
    note: "Upside: the ad's first-week CTR back at today's CPM",
  },
  risk: "risky",
  type: "refresh_creative",
  windowDays: 7,
};

const pauseProductAds = (finding: Finding): Draft => ({
  impact: {
    base: fact(finding, "spendPerDay"),
    downside: fact(finding, "spendPerDay"),
    note: "Sales lost are ones that couldn't ship",
    unit: "usd_per_day",
  },
  // Proposed at once (no settle wait), applied only once the merchant approves.
  risk: "risky",
  rollback: "resume_product_ads",
  status: "ACTIVE",
  type: "pause_product_ads",
});

const resumeAd = (finding: Finding): Draft => {
  const days = 3;
  const margin = fact(finding, "perSale") - fact(finding, "shopCpa");
  const spend = fact(finding, "spendPerDay") * days;
  return {
    impact: {
      base: (ratio(spend, fact(finding, "shopCpa")) ?? 0) * margin,
      downside: -spend,
      unit: "usd",
    },
    risk: "safe",
    rollback: "pause_ad",
    status: "PAUSED",
    type: "resume_ad",
    windowDays: days,
  };
};

const pauseAd =
  (risk: Risk) =>
  (finding: Finding): Draft[] => [
    {
      impact: pauseImpact(finding, 3),
      risk,
      rollback: "resume_ad",
      status: "ACTIVE",
      type: "pause_ad",
      windowDays: 3,
    },
  ];

const pauseDesign = (finding: Finding): Draft[] => [
  {
    impact: pauseImpact(finding, 7),
    risk: "risky",
    type: "pause_design",
    windowDays: 7,
  },
];

const bundleOffer = (finding: Finding): Draft => {
  const perOrder = fact(finding, "bundlePerOrder");
  return {
    impact: {
      base: perOrder - 2 * fact(finding, "perSale"),
      downside: 0,
      note: `Breakeven per bundle ${perOrder.toFixed(2)}`,
      unit: "usd",
    },
    risk: "risky",
    type: "bundle_offer",
    windowDays: 14,
  };
};

const opsBudgetDown: Draft = {
  impact: none,
  risk: "risky",
  type: "budget_down",
  windowDays: 7,
};

const nothing = (): Draft[] => [];

// The actions each finding pattern offers.
const drafts: Record<
  FindingPattern,
  (finding: Finding, settings: Settings) => Draft[]
> = {
  ad_no_sale: (finding) =>
    fact(finding, "activeSiblings") > 0 ? pauseAd("safe")(finding) : [],
  blank_out_of_stock: (finding) => [pauseProductAds(finding)],
  chargeback: () => [advice("ops_alert")],
  clicks_no_sale: pauseDesign,
  color_discontinued: () => [refresh],
  creative_fatigue: () => [refresh],
  fulfillment_delay: (finding) => [
    advice("ops_alert"),
    ...(fact(finding, "lateShare") > 0.5 ? [opsBudgetDown] : []),
  ],
  low_aov: (finding) => [bundleOffer(finding)],
  missed_sale: (finding) => [resumeAd(finding)],
  no_click: () => [refresh],
  over_breakeven: (finding, settings) => [budgetDown(finding, settings)],
  production_error: (finding) => [
    advice("ops_alert"),
    ...(fact(finding, "count") >= 2 ? [pauseProductAds(finding)] : []),
  ],
  refund_spike: () => [advice("quality_check", 14)],
  restocked: () => [
    {
      impact: none,
      risk: "safe",
      rollback: "pause_product_ads",
      status: "PAUSED",
      type: "resume_product_ads",
      windowDays: 3,
    },
  ],
  seasonal_cutoff: nothing,
  seasonal_end: pauseDesign,
  shipping_issue: () => [advice("ops_alert")],
  shop_wide: nothing,
  single_concept: () => [refresh],
  size_mix_erodes_margin: (finding, settings) => [
    priceChange(finding, settings),
  ],
  source_disagreement: () => [advice("fix_tracking")],
  tracking_gap: () => [advice("fix_tracking")],
  trend_shift: nothing,
  unsettled_spend: pauseAd("risky"),
  winner_capped: (finding, settings) => [budgetUp(finding, settings)],
};

const sha = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

const candidateOf = (
  finding: Finding,
  draft: Draft,
  day: string
): Candidate => {
  const id = `${draft.type}:${entityKey(finding.entity)}`;
  return {
    ...(draft.amount === undefined ? {} : { amount: draft.amount }),
    expectedImpact: draft.impact,
    findingId: findingKey(finding),
    id,
    idempotencyKey: sha(JSON.stringify([id, draft.amount ?? null, day])),
    precondition: draft.status === undefined ? {} : { status: draft.status },
    risk: draft.risk,
    ...(draft.rollback === undefined ? {} : { rollback: draft.rollback }),
    rule: finding.rule,
    target: finding.entity,
    type: draft.type,
    ...(draft.windowDays === undefined
      ? {}
      : { windowHours: draft.windowDays * HOURS_PER_DAY }),
  };
};

const hold: Candidate = {
  expectedImpact: { ...none, note: "Current trajectory" },
  id: "hold",
  idempotencyKey: "hold",
  precondition: {},
  risk: "none",
  rule: "ads-optimize",
  target: { id: "shop", kind: "shop" },
  type: "hold",
};

// Every candidate the findings allow, one per id. Kills are left out while a
// reconciliation block covers the target or a refund spike waits on the
// merchant (POD-O2); scaling stops near a season's cutoff (POD-S1). `hold` is
// always on the menu.
export const buildMenu = (
  findings: Finding[],
  context: MenuContext
): Candidate[] => {
  const waiting = findings.some((f) =>
    ["refund_spike", "tracking_gap"].includes(f.pattern)
  );
  const cutoff = findings.some((f) => f.pattern === "seasonal_cutoff");
  const allowed = (candidate: Candidate) => {
    const blocked =
      isKill(candidate) &&
      (waiting ||
        isKillBlocked(
          candidate.target,
          context.ancestorsOf(candidate.target),
          context.blocks
        ));
    const scaleStopped = candidate.type === "budget_up" && (cutoff || waiting);
    return !(blocked || scaleStopped);
  };
  const candidates = findings.flatMap((finding) =>
    drafts[finding.pattern](finding, context.settings).map((draft) =>
      candidateOf(finding, draft, context.day)
    )
  );
  const menu = new Map<string, Candidate>();
  for (const candidate of candidates.filter(allowed)) {
    if (!menu.has(candidate.id)) {
      menu.set(candidate.id, candidate);
    }
  }
  menu.set(hold.id, hold);
  return [...menu.values()];
};

// The model's ranking, checked: ids not on the menu are dropped, duplicates
// collapse, and `hold` is always there (first when nothing else survived).
export const rankFromModel = (ids: string[], menu: Candidate[]) => {
  const byId = new Map(menu.map((candidate) => [candidate.id, candidate]));
  const ranked = [...new Set(ids)].flatMap((id) => {
    const candidate = byId.get(id);
    return candidate === undefined ? [] : [candidate];
  });
  return ranked.some((candidate) => candidate.type === "hold")
    ? ranked
    : [...ranked, hold];
};

// The code-only fallback: the menu by expected impact, `hold` included.
export const rankByImpact = (menu: Candidate[]) =>
  menu.toSorted((a, b) => b.expectedImpact.base - a.expectedImpact.base);
