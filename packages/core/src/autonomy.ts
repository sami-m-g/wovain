// What wovain may do on its own for a merchant, and what waits for them.
//
// Every write an agent proposes (store, media buying, autopilot) is a typed
// action from the closed catalog below, with a risk class:
// - R0 read: reports, sync. Always allowed.
// - R1 reversible and invisible to customers: a hidden draft, a paused
//   campaign, an inactive promotion.
// - R2 reversible but visible to customers or revenue: publish, reprice,
//   activate a promotion or a campaign, change a budget.
// - R3 destructive or hard to undo: archive, take the site live, change a
//   shipping address.
// - R4 money-moving and irreversible: refund, cancel, gift cards, sample
//   checkouts (the designer pays).
//
// The merchant's autonomy level (set in the brand wizard) says how far up
// that scale wovain acts alone:
// - suggest: nothing but reads; every write is a suggestion to approve.
// - draft: R1 too (hidden drafts, paused campaigns).
// - publish_ads_paused: R2 too (publish products and drops), but never an
//   action that starts ad spend.
// R3 and R4 always wait for the merchant, and so does any action that
// starts or raises ad spend. Spend caps are hard limits: an action that
// would pass the daily or monthly cap is denied, even with approval.

export const AUTONOMY_LEVELS = [
  "suggest",
  "draft",
  "publish_ads_paused",
] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const RISK_CLASSES = ["R0", "R1", "R2", "R3", "R4"] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

// Which queue screen an action belongs to. One table serves all three.
export const ACTION_DOMAINS = ["store", "media", "autopilot"] as const;
export type ActionDomain = (typeof ACTION_DOMAINS)[number];

export interface ActionSpec {
  domain: ActionDomain;
  risk: RiskClass;
  // Starts or raises ad spend: never automatic, and checked against the
  // spend caps.
  spends: boolean;
}

const spec = (
  domain: ActionDomain,
  risk: RiskClass,
  spends = false
): ActionSpec => ({ domain, risk, spends });

// The closed action catalog. Add an action here (with its class) before any
// agent proposes it; an unknown type is denied.
export const ACTIONS = {
  "autopilot.design.approve": spec("autopilot", "R1"),
  "autopilot.drop.create": spec("autopilot", "R1"),
  "autopilot.run.start": spec("autopilot", "R1"),
  "media.ad.pause": spec("media", "R1"),
  "media.audience.create": spec("media", "R1"),
  "media.budget.change": spec("media", "R2", true),
  "media.campaign.activate": spec("media", "R2", true),
  "media.campaign.archive": spec("media", "R3"),
  "media.campaign.create_paused": spec("media", "R1"),
  "media.campaign.pause": spec("media", "R1"),
  "media.creative.refresh": spec("media", "R1"),
  "store.collection.publish": spec("store", "R2"),
  "store.drop.publish": spec("store", "R2"),
  // The undo of store.drop.publish: hides the drop's products and its
  // collection again.
  "store.drop.unpublish": spec("store", "R2"),
  "store.gift_card.create": spec("store", "R4"),
  "store.listing.edit": spec("store", "R1"),
  "store.order.cancel": spec("store", "R4"),
  "store.order.change_address": spec("store", "R3"),
  "store.order.refund": spec("store", "R4"),
  "store.product.archive": spec("store", "R3"),
  "store.product.create_hidden": spec("store", "R1"),
  "store.product.extend": spec("store", "R1"),
  "store.product.publish": spec("store", "R2"),
  "store.product.reprice": spec("store", "R2"),
  "store.product.unpublish": spec("store", "R2"),
  "store.promotion.activate": spec("store", "R2"),
  "store.promotion.create": spec("store", "R1"),
  "store.promotion.deactivate": spec("store", "R2"),
  "store.report.read": spec("store", "R0"),
  // The designer pays for a sample on Fourthwall's checkout.
  "store.sample.checkout": spec("store", "R4"),
  // The merchant marks a setup step done that no API can see (payouts set
  // up by Fourthwall support). Nothing is written to the shop.
  "store.setup.confirm": spec("store", "R1"),
  "store.site.set_status": spec("store", "R3"),
} as const satisfies Record<string, ActionSpec>;

export type ActionType = keyof typeof ACTIONS;
export const ACTION_TYPES = Object.keys(ACTIONS) as ActionType[];

export const isActionType = (type: string): type is ActionType =>
  Object.hasOwn(ACTIONS, type);

export interface AutonomySettings {
  level: AutonomyLevel;
  // US cents of ad spend wovain may commit per day and per month, across
  // every campaign it manages. 0 means no spend at all.
  dailySpendCapCents: number;
  monthlySpendCapCents: number;
  // The merchant's "pause the agent" switch: nothing runs on its own.
  paused: boolean;
}

// A new merchant: suggestions only, no spend, not paused.
export const DEFAULT_AUTONOMY: AutonomySettings = {
  dailySpendCapCents: 0,
  level: "suggest",
  monthlySpendCapCents: 0,
  paused: false,
};

// The action as the policy sees it.
export interface PolicyAction {
  type: string;
  // US cents of new ad spend the action may commit: a campaign's daily
  // budget when it activates, or the increase when a budget is raised.
  spendCents?: number | undefined;
  // A profit rule's stop (./ad-rules.ts): a pause that only lowers spend.
  // It runs at once at every level, since waiting for the merchant is what
  // loses the money.
  protective?: boolean | undefined;
}

// Ad spend already committed, in US cents: today's, and the month's to
// date plus what running campaigns will spend before it ends.
export interface SpendToDate {
  todayCents: number;
  monthCents: number;
  // Days left in the month, today included: a new daily budget runs on
  // each of them, so the monthly cap is checked against that many days.
  // Absent means one day.
  daysLeftInMonth?: number | undefined;
}

export type PolicyVerdict = "allow" | "needs_approval" | "deny";

export type PolicyReason =
  | "read_only"
  | "within_level"
  | "above_level"
  | "agent_paused"
  | "starts_spend"
  | "always_approve"
  | "over_daily_cap"
  | "over_monthly_cap"
  | "unknown_action"
  | "protective_stop";

export interface PolicyDecision {
  verdict: PolicyVerdict;
  reason: PolicyReason;
}

// The highest risk class each level runs alone.
const AUTO_UP_TO: Record<AutonomyLevel, RiskClass> = {
  draft: "R1",
  publish_ads_paused: "R2",
  suggest: "R0",
};

const rank = (risk: RiskClass) => RISK_CLASSES.indexOf(risk);

const NO_SPEND: SpendToDate = { monthCents: 0, todayCents: 0 };

// Whether wovain may run `action` now without asking the merchant.
// `allow`: run it. `needs_approval`: queue it for the merchant. `deny`: it
// may not run at all (an unknown action, or one past a spend cap).
export const canAutoExecute = (
  action: PolicyAction,
  settings: AutonomySettings,
  spent: SpendToDate = NO_SPEND
): PolicyDecision => {
  if (!isActionType(action.type)) {
    return { reason: "unknown_action", verdict: "deny" };
  }
  const { risk, spends } = ACTIONS[action.type];
  if (risk === "R0") {
    return { reason: "read_only", verdict: "allow" };
  }
  if (action.protective === true && !spends && rank(risk) <= rank("R1")) {
    return { reason: "protective_stop", verdict: "allow" };
  }
  if (spends) {
    const spend = Math.max(0, action.spendCents ?? 0);
    if (spent.todayCents + spend > settings.dailySpendCapCents) {
      return { reason: "over_daily_cap", verdict: "deny" };
    }
    const days = Math.max(1, spent.daysLeftInMonth ?? 1);
    if (spent.monthCents + spend * days > settings.monthlySpendCapCents) {
      return { reason: "over_monthly_cap", verdict: "deny" };
    }
  }
  if (risk === "R3" || risk === "R4") {
    return { reason: "always_approve", verdict: "needs_approval" };
  }
  if (spends) {
    return { reason: "starts_spend", verdict: "needs_approval" };
  }
  if (settings.paused) {
    return { reason: "agent_paused", verdict: "needs_approval" };
  }
  return rank(risk) <= rank(AUTO_UP_TO[settings.level])
    ? { reason: "within_level", verdict: "allow" }
    : { reason: "above_level", verdict: "needs_approval" };
};
