import { adRuleSettingsOf, stopOf } from "@wovain/core/ad-rules";
import type {
  AdResults,
  AdRuleSettings,
  CampaignDecision,
  Kill,
  Stop,
  UnitEconomics,
} from "@wovain/core/ad-rules";
import type { EnqueueInput } from "@wovain/core/approvals";
import type { AutonomySettings, SpendToDate } from "@wovain/core/autonomy";
import { EVENTS } from "@wovain/core/events";
import type { NotifyKind } from "@wovain/core/events";
import type { AdStats } from "@wovain/core/optimizer";
import type { MetaCampaignRead } from "@wovain/core/optimizer-meta";
import { baseCostCeiling, profitPerSale } from "@wovain/core/pricing";
import type { DecisionTrace } from "@wovain/core/trace";
import { auditEvent, autonomySetting } from "@wovain/db/schema/autonomy";
import type { campaign } from "@wovain/db/schema/seller";
import { product } from "@wovain/db/schema/seller";
import { and, eq, inArray } from "drizzle-orm";
import { log as evlog } from "evlog";

import type { Actor } from "./actor";
import { approvalsFor } from "./approvals";
import { flagContextOf } from "./flags";

// The ads profit rules in the optimizer's tick (openspec ads-profit-rules,
// flag ads-profit-rules; the rules themselves are @wovain/core/ad-rules):
// - first the merchant's stops (daily cap, monthly cap, loss limit), which
//   pause every running campaign;
// - then each campaign's kills (pause an ad, or the campaign) and its raise.
// Kills and stops are protective: the policy runs them at every level.
// Each action goes to the decision trace with its numbers, onto the
// approval queue, and to the merchant as a wovain/notify event.

type CampaignRow = typeof campaign.$inferSelect;

const AGENT = "ad_rules";
const CENTS = 100;
// A raise the merchant hasn't approved within a day lapses, like the
// optimizer's own proposals.
const APPROVAL_TTL_MS = 86_400_000;

export const isAdRulesOn = async (actor: Actor) =>
  await actor.core.flags.isOn("ads-profit-rules", flagContextOf(actor));

// The merchant's thresholds: their overrides and loss limit over the
// defaults.
export const adRulesOf = async (
  actor: Pick<Actor, "db" | "userId">
): Promise<AdRuleSettings> => {
  const [row] = await actor.db
    .select({
      adRules: autonomySetting.adRules,
      lossLimitCents: autonomySetting.lossLimitCents,
    })
    .from(autonomySetting)
    .where(eq(autonomySetting.userId, actor.userId));
  return adRuleSettingsOf(
    row === undefined
      ? {}
      : { ...row.adRules, lossLimitCents: row.lossLimitCents }
  );
};

export const setLossLimit = async (
  actor: Pick<Actor, "db" | "userId">,
  lossLimitCents: number
): Promise<AdRuleSettings> => {
  const before = await adRulesOf(actor);
  await actor.db
    .insert(autonomySetting)
    .values({ lossLimitCents, userId: actor.userId })
    .onConflictDoUpdate({
      set: { lossLimitCents },
      target: autonomySetting.userId,
    });
  await actor.db.insert(auditEvent).values({
    actor: actor.userId,
    after: { lossLimitCents },
    approvalId: null,
    before: { lossLimitCents: before.lossLimitCents },
    event: "settings_changed",
    note: null,
    userId: actor.userId,
  });
  return await adRulesOf(actor);
};

// What one sale of each product leaves: its price, less the highest base
// cost that price allows (prices are cost-plus), fees and the refund
// reserve. The highest cost gives the lowest profit, so the tightest
// target CPA.
export const economicsOf = async (
  actor: Pick<Actor, "db" | "userId">,
  productIds: string[]
): Promise<Map<string, UnitEconomics>> => {
  if (productIds.length === 0) {
    return new Map();
  }
  const rows = await actor.db
    .select({ id: product.id, price: product.price })
    .from(product)
    .where(
      and(eq(product.userId, actor.userId), inArray(product.id, productIds))
    );
  return new Map(
    rows.map((row) => [
      row.id,
      {
        priceCents: Math.round(row.price * CENTS),
        profitCents: Math.floor(
          profitPerSale(row.price, baseCostCeiling(row.price)) * CENTS
        ),
      },
    ])
  );
};

export const adResultsOf = (ads: readonly AdStats[]): AdResults[] =>
  ads.map((ad) => ({
    active: ad.active,
    adId: ad.adId,
    addToCarts: ad.addToCarts ?? 0,
    clicks: ad.clicks,
    impressions: ad.impressions,
    purchases: ad.purchases ?? 0,
    spendCents: ad.spendCents,
  }));

export interface RuleOutcome {
  approvalIds: string[];
  campaignId: string;
  outcome: "rule";
  rule: string;
}

interface Queue {
  autonomy: AutonomySettings;
  spent: SpendToDate;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Tells the merchant what a rule did, or asks them. A failed send is
// logged at error level; the action itself stands.
const notify = async (
  actor: Actor,
  data: { approvalId: string; body: string; kind: NotifyKind; title: string }
) => {
  try {
    await actor.events?.send({
      data: { ...data, actions: [], userId: actor.userId },
      name: EVENTS.notify,
    });
  } catch (error) {
    evlog.error({
      approvalId: data.approvalId,
      error: "AD_RULES_NOTIFY_FAILED",
      reason: messageOf(error),
      userId: actor.userId,
    });
  }
};

const enqueue = async (
  actor: Actor,
  trace: DecisionTrace,
  input: Omit<EnqueueInput, "proposedBy" | "userId">,
  { autonomy, spent }: Queue,
  note: { body: string; kind: NotifyKind; title: string }
) => {
  const { approval, created, decision } = await approvalsFor(actor).enqueue(
    { ...input, proposedBy: "optimizer", userId: actor.userId },
    autonomy,
    spent
  );
  trace.add({
    agent: "policy",
    inputSummary: `${input.type} at level ${autonomy.level}`,
    output: { approvalId: approval.id, decision, status: approval.status },
    sources: [{ provider: "rule", title: "canAutoExecute" }],
    step: "policy",
  });
  if (created) {
    await notify(actor, { ...note, approvalId: approval.id });
  }
  return approval.id;
};

const pauseCampaignInput = (
  row: CampaignRow,
  rule: string,
  reason: string,
  numbers: Record<string, number>,
  day: string
) => ({
  idempotencyKey: `rules:${row.id}:${day}:pause_campaign:${rule}`,
  payload: {
    campaignId: row.id,
    metaCampaignId: row.metaCampaignId,
    numbers,
    rule,
  },
  protective: true,
  reason,
  title: `Pause campaign ${row.metaCampaignId}`,
  type: "media.campaign.pause" as const,
});

// The merchant's stop, when one applies: pauses every running campaign.
export const applyStop = async (
  actor: Actor,
  trace: DecisionTrace,
  {
    now,
    queue,
    reads,
    settings,
    economics,
  }: {
    now: Date;
    queue: Queue;
    reads: Map<string, { read: MetaCampaignRead; row: CampaignRow }>;
    settings: AdRuleSettings;
    economics: Map<string, UnitEconomics>;
  }
): Promise<{ outcomes: RuleOutcome[]; stop: Stop | undefined }> => {
  let todayCents = 0;
  let monthCents = 0;
  let totalSpendCents = 0;
  let totalProfitCents = 0;
  for (const { read, row } of reads.values()) {
    todayCents += read.spendTodayCents;
    monthCents += read.spendMonthCents;
    const profit = economics.get(row.productId)?.profitCents ?? 0;
    for (const ad of read.ads) {
      totalSpendCents += ad.spendCents;
      totalProfitCents += (ad.purchases ?? 0) * profit;
    }
  }
  const spend = { monthCents, todayCents, totalProfitCents, totalSpendCents };
  const stop = stopOf(spend, queue.autonomy, settings);
  trace.add({
    agent: AGENT,
    inputSummary: `spend today ${todayCents}c, month ${monthCents}c, total ${totalSpendCents}c, profit ${totalProfitCents}c`,
    output: { settings, spend, stop },
    sources: [{ provider: "rule", title: "Caps and loss limit" }],
    step: "stop",
  });
  if (stop === undefined) {
    return { outcomes: [], stop };
  }
  const day = isoDay(now);
  const outcomes: RuleOutcome[] = [];
  for (const { read, row } of reads.values()) {
    if (!read.live) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    const approvalId = await enqueue(
      actor,
      trace,
      pauseCampaignInput(row, stop.reason, stop.text, stop.numbers, day),
      queue,
      {
        body: `wovain paused campaign ${row.metaCampaignId}. ${stop.text}`,
        kind: "anomaly",
        title: "Ads paused to protect your money",
      }
    );
    outcomes.push({
      approvalIds: [approvalId],
      campaignId: row.id,
      outcome: "rule",
      rule: stop.reason,
    });
  }
  return { outcomes, stop };
};

const killInput = (row: CampaignRow, kill: Kill, day: string) => ({
  idempotencyKey: `rules:${row.id}:${day}:${kill.rule}:${kill.adId}`,
  inverse: { adId: kill.adId, status: "ACTIVE" },
  payload: {
    adAccountId: row.adAccountId,
    adId: kill.adId,
    campaignId: row.id,
    numbers: kill.numbers,
    rule: kill.rule,
  },
  protective: true,
  reason: kill.reason,
  title: `Pause ad ${kill.adId}: it isn't selling`,
  type: "media.ad.pause" as const,
});

const scaleInput = (
  row: CampaignRow,
  decision: Extract<CampaignDecision, { kind: "scale" }>,
  now: Date
) => ({
  costPreview: {
    amountCents: decision.toCents,
    currency: "USD",
    label: "New daily ad budget, charged by Meta to your ad account",
  },
  expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
  idempotencyKey: `rules:${row.id}:${isoDay(now)}:scale:${decision.toCents}`,
  inverse: { dailyBudgetCents: decision.fromCents },
  payload: {
    adAccountId: row.adAccountId,
    campaignId: row.id,
    fromCents: decision.fromCents,
    metaCampaignId: row.metaCampaignId,
    numbers: decision.numbers,
    rule: "scale",
    toCents: decision.toCents,
  },
  reason: decision.reason,
  spendCents: decision.toCents - decision.fromCents,
  title: `Raise the daily budget from $${(decision.fromCents / CENTS).toFixed(2)} to $${(decision.toCents / CENTS).toFixed(2)}`,
  type: "media.budget.change" as const,
});

// One campaign's kills and raise. `undefined` when no rule fires, so the
// bandit may still propose.
export const applyCampaignRules = async (
  actor: Actor,
  trace: DecisionTrace,
  {
    decision,
    hasOutstanding,
    now,
    queue,
    row,
  }: {
    decision: CampaignDecision;
    hasOutstanding: () => Promise<boolean>;
    now: Date;
    queue: Queue;
    row: CampaignRow;
  }
): Promise<RuleOutcome | undefined> => {
  const day = isoDay(now);
  if (decision.kind === "pause_campaign") {
    const reason = [decision.reason, ...decision.kills.map((k) => k.reason)]
      .join(" ")
      .trim();
    const approvalId = await enqueue(
      actor,
      trace,
      pauseCampaignInput(
        row,
        "all_ads_failed",
        reason,
        Object.fromEntries(
          decision.kills.map((kill) => [
            kill.adId,
            kill.numbers.spendCents ?? 0,
          ])
        ),
        day
      ),
      queue,
      {
        body: `wovain paused campaign ${row.metaCampaignId}. ${reason}`,
        kind: "anomaly",
        title: "Campaign paused: it isn't selling",
      }
    );
    return {
      approvalIds: [approvalId],
      campaignId: row.id,
      outcome: "rule",
      rule: "pause_campaign",
    };
  }
  if (decision.kind === "pause_ads") {
    const approvalIds: string[] = [];
    for (const kill of decision.kills) {
      // oxlint-disable-next-line no-await-in-loop
      const approvalId = await enqueue(
        actor,
        trace,
        killInput(row, kill, day),
        queue,
        {
          body: `wovain paused ad ${kill.adId}. ${kill.reason}`,
          kind: "anomaly",
          title: "Ad paused: it isn't selling",
        }
      );
      approvalIds.push(approvalId);
    }
    return {
      approvalIds,
      campaignId: row.id,
      outcome: "rule",
      rule: "pause_ads",
    };
  }
  if (decision.kind === "scale") {
    if (await hasOutstanding()) {
      return undefined;
    }
    const approvalId = await enqueue(
      actor,
      trace,
      scaleInput(row, decision, now),
      queue,
      {
        body: `${decision.reason} Approve to raise the daily budget to $${(decision.toCents / CENTS).toFixed(2)}.`,
        kind: "approval",
        title: "A product is selling: raise its budget?",
      }
    );
    return {
      approvalIds: [approvalId],
      campaignId: row.id,
      outcome: "rule",
      rule: "scale",
    };
  }
  return undefined;
};
