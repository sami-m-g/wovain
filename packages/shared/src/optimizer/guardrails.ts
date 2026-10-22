import { MAX_DAILY_BUDGET } from "../settings.ts";
import type { Settings } from "../settings.ts";
import { isSettled } from "./ledger.ts";
import { isKill } from "./menu.ts";
import { isKillBlocked } from "./reconcile.ts";
import type {
  ActionType,
  Block,
  Candidate,
  Change,
  Entity,
} from "./records.ts";

// The guardrails and hard limits (spec section 7). `violations` lists every
// limit an action breaks; an action applies on its own only when the merchant
// chose `safe`, it's a safe action, and nothing is violated. Hard limits hold
// whatever the settings say.

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;

// Shopper-facing or credit-spending changes always wait for the merchant.
const ALWAYS_APPROVAL = new Set<ActionType>([
  "price_change",
  "bundle_offer",
  "refresh_creative",
  "audience_change",
  "ab_test",
]);
const PAUSES = new Set<ActionType>(["pause_ad", "pause_design"]);
const RESUMES = new Set<ActionType>(["resume_ad", "resume_product_ads"]);

export type Violation =
  | "off"
  | "approval_required"
  | "budget_cap"
  | "budget_step"
  | "cooldown"
  | "pauses_per_day"
  | "unsettled"
  | "price_floor"
  | "last_ad"
  | "kill_blocked"
  | "not_launched"
  | "not_ours";

export interface GuardContext {
  // Active ads left on the target's design, the target included.
  activeAdsInDesign?: number;
  ancestors: Entity[];
  blocks: Block[];
  campaignLaunched: boolean;
  changes: Change[];
  currentBudget?: number;
  // The newest data the action rests on, per source.
  dataAt: { fourthwall?: number; meta?: number };
  maxDailyBudget: number;
  now: number;
  // The ad or product was paused by the optimizer (its action record says so).
  pausedByOptimizer?: boolean;
  priceFloor?: number;
  settings: Settings;
}

// The budget the optimizer may reach: the merchant's cap, or the campaign
// budget per product × products × the scale cap, never above $500 a day.
export const budgetCap = (settings: Settings, products: number) =>
  Math.min(
    settings.optimizer.maxDailyBudget ??
      settings.campaign.dailyBudgetPerProduct *
        Math.max(1, products) *
        settings.rules.scaleCapMultiple,
    MAX_DAILY_BUDGET
  );

// Data the action rests on is settled: Fourthwall after shopSettleMinutes,
// Meta after conversionLagHours. Missing data isn't settled.
export const settledFor = (
  dataAt: GuardContext["dataAt"],
  now: number,
  optimizer: Settings["optimizer"]
) =>
  dataAt.fourthwall !== undefined &&
  isSettled(dataAt.fourthwall, now, optimizer.shopSettleMinutes * MINUTE) &&
  (dataAt.meta === undefined ||
    isSettled(dataAt.meta, now, optimizer.conversionLagHours * HOUR));

const today = (changes: Change[], now: number) =>
  changes.filter((change) => now - change.at < DAY);

const budgetViolations = (
  action: Candidate,
  context: GuardContext
): Violation[] => {
  if (action.amount === undefined || context.currentBudget === undefined) {
    return [];
  }
  const found: Violation[] = [];
  if (action.amount > Math.min(context.maxDailyBudget, MAX_DAILY_BUDGET)) {
    found.push("budget_cap");
  }
  const step =
    (Math.abs(action.amount - context.currentBudget) / context.currentBudget) *
    100;
  const moved = today(context.changes, context.now)
    .filter((c) => c.kind === "budget" && c.objectId === action.target.id)
    .reduce((total, c) => total + Math.abs(c.pct ?? 0), 0);
  if (
    step + moved >
    context.settings.optimizer.maxBudgetChangePctPerDay + 1e-9
  ) {
    found.push("budget_step");
  }
  return found;
};

const killViolations = (
  action: Candidate,
  context: GuardContext
): Violation[] => {
  const { now, settings } = context;
  const found: Violation[] = [];
  if (!settledFor(context.dataAt, now, settings.optimizer)) {
    found.push("unsettled");
  }
  if (isKillBlocked(action.target, context.ancestors, context.blocks)) {
    found.push("kill_blocked");
  }
  const pauses = today(context.changes, now).filter(
    (c) => c.kind === "kill_pause"
  ).length;
  if (
    PAUSES.has(action.type) &&
    pauses >= settings.optimizer.maxAutoPausesPerDay
  ) {
    found.push("pauses_per_day");
  }
  return found;
};

const changeViolations = (
  action: Candidate,
  context: GuardContext
): Violation[] => {
  const found: Violation[] = [];
  const cooldownMs = context.settings.optimizer.cooldownHours * HOUR;
  const recent = context.changes.some(
    (c) => c.objectId === action.target.id && context.now - c.at < cooldownMs
  );
  // Operations pauses act on Fourthwall facts and don't wait out a cooldown.
  if (recent && !action.rule.startsWith("POD-O")) {
    found.push("cooldown");
  }
  if (action.type === "pause_ad" && (context.activeAdsInDesign ?? 0) <= 1) {
    found.push("last_ad");
  }
  if (
    (RESUMES.has(action.type) || action.type === "budget_up") &&
    !context.campaignLaunched
  ) {
    found.push("not_launched");
  }
  if (RESUMES.has(action.type) && context.pausedByOptimizer !== true) {
    found.push("not_ours");
  }
  const floor = context.priceFloor;
  if (
    action.type === "price_change" &&
    (action.amount === undefined ||
      (floor !== undefined && action.amount < floor))
  ) {
    found.push("price_floor");
  }
  return found;
};

// Every limit the action breaks.
export const violations = (
  action: Candidate,
  context: GuardContext
): Violation[] => [
  ...(context.settings.optimizer.enabled &&
  context.settings.optimizer.autonomy !== "off"
    ? []
    : (["off"] as const)),
  ...(ALWAYS_APPROVAL.has(action.type) || action.risk !== "safe"
    ? (["approval_required"] as const)
    : []),
  ...budgetViolations(action, context),
  ...(isKill(action) ? killViolations(action, context) : []),
  ...changeViolations(action, context),
];

// Applied with no one asking: only under `safe` autonomy, for a safe action
// that breaks no limit. Everything else goes to the inbox.
export const canAutoApply = (action: Candidate, context: GuardContext) =>
  context.settings.optimizer.autonomy === "safe" &&
  violations(action, context).length === 0;
