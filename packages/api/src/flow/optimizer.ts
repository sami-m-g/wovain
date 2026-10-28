import type { Approval } from "@wovain/core/approvals";
import type { ActionType } from "@wovain/core/autonomy";
import { assessCampaign, reviewProposal } from "@wovain/core/optimizer";
import type { Assessment, Proposal, Rng } from "@wovain/core/optimizer";
import {
  pauseAd,
  readCampaign,
  setCampaignBudget,
} from "@wovain/core/optimizer-meta";
import { DecisionTrace } from "@wovain/core/trace";
import type { ToolCall } from "@wovain/core/upstream";
import { adOptimizerState } from "@wovain/db/schema/autonomy";
import { campaign } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { log as evlog } from "evlog";
import { z } from "zod";

import type { Actor } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  spendToDate,
  traceSinkFor,
} from "./approvals";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";

// The ads optimizer's flow (openspec ads-optimizer): for each of the
// merchant's wovain campaigns it reads Meta, saves each ad's bandit state,
// proposes at most one change (@wovain/core/optimizer), has the reasoning
// model review it, and enqueues it on the approval queue. The policy runs it
// at once within the merchant's autonomy level; otherwise it waits for
// them. `executeOptimizerApproval` performs an approved action on Meta.
// Every step goes to the decision trace.

export const OPTIMIZER_ACTIONS = [
  "media.ad.pause",
  "media.budget.change",
] as const satisfies readonly ActionType[];

const AGENT = "optimizer";

type CampaignRow = typeof campaign.$inferSelect;

export interface OptimizerDeps {
  // The Meta MCP call; the merchant's connection when absent.
  meta?: <T>(work: (call: ToolCall) => Promise<T>) => Promise<T>;
  now?: () => Date;
  rng?: Rng;
}

export type CampaignOutcome =
  | { campaignId: string; outcome: "held"; hold: string }
  | { campaignId: string; outcome: "vetoed"; reason: string }
  | {
      approvalId: string;
      campaignId: string;
      outcome: "enqueued";
      status: Approval["status"];
    }
  | { campaignId: string; outcome: "failed"; error: string };

const metaOf =
  (actor: Actor, deps: OptimizerDeps) =>
  async <T>(work: (call: ToolCall) => Promise<T>) =>
    deps.meta === undefined
      ? await withProvider(actor, "meta", work)
      : await deps.meta(work);

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const params = z.object({ lastEditAt: z.string().optional() }).loose();

// wovain's last significant edit of the campaign's ad set.
const lastEditOf = (rows: (typeof adOptimizerState.$inferSelect)[]) => {
  const edits = rows.flatMap((row) => {
    const parsed = params.safeParse(row.params);
    const at = parsed.success ? parsed.data.lastEditAt : undefined;
    return at === undefined ? [] : [new Date(at).getTime()];
  });
  return edits.length === 0 ? undefined : new Date(Math.max(...edits));
};

const stateRows = async ({ db, userId }: Actor, campaignId: string) =>
  await db
    .select()
    .from(adOptimizerState)
    .where(
      and(
        eq(adOptimizerState.userId, userId),
        eq(adOptimizerState.campaignId, campaignId)
      )
    );

const saveScores = async (
  actor: Actor,
  row: CampaignRow,
  assessment: Assessment,
  read: Awaited<ReturnType<typeof readCampaign>>,
  learning: boolean
) => {
  for (const ad of read.ads) {
    const score = assessment.scores.find((item) => item.adId === ad.adId);
    const values = {
      alpha: score?.posterior.alpha ?? 1 + ad.clicks,
      beta:
        score?.posterior.beta ?? 1 + Math.max(0, ad.impressions - ad.clicks),
      campaignId: row.id,
      clicks: ad.clicks,
      impressions: ad.impressions,
      learning,
      metaAdId: ad.adId,
      metaAdSetId: row.adSetId,
      spendCents: ad.spendCents,
      status: ad.active ? ("active" as const) : ("paused" as const),
      userId: actor.userId,
      weight: score?.probabilityBest ?? 0,
    };
    // oxlint-disable-next-line no-await-in-loop
    await actor.db
      .insert(adOptimizerState)
      .values(values)
      .onConflictDoUpdate({
        // params keep wovain's last edit; the rest is Meta's latest.
        set: values,
        target: [adOptimizerState.userId, adOptimizerState.metaAdId],
      });
  }
};

const enqueueInput = (
  actor: Actor,
  row: CampaignRow,
  proposal: Proposal,
  review: string,
  day: string
) => {
  const base = {
    proposedBy: "optimizer" as const,
    reason: `${proposal.reason} Reviewer: ${review}`,
    userId: actor.userId,
  };
  if (proposal.type === "media.ad.pause") {
    return {
      ...base,
      idempotencyKey: `optimizer:${row.id}:${day}:pause:${proposal.adId}`,
      inverse: { adId: proposal.adId, status: "ACTIVE" },
      payload: {
        adAccountId: row.adAccountId,
        adId: proposal.adId,
        campaignId: row.id,
      },
      title: `Pause a weak ad in campaign ${row.metaCampaignId}`,
      type: proposal.type,
    };
  }
  const raise = Math.max(0, proposal.toCents - proposal.fromCents);
  return {
    ...base,
    costPreview: {
      amountCents: proposal.toCents,
      currency: "USD",
      label: "New daily ad budget, charged by Meta to your ad account",
    },
    idempotencyKey: `optimizer:${row.id}:${day}:budget:${proposal.toCents}`,
    inverse: { dailyBudgetCents: proposal.fromCents },
    payload: {
      adAccountId: row.adAccountId,
      campaignId: row.id,
      fromCents: proposal.fromCents,
      metaCampaignId: row.metaCampaignId,
      toCents: proposal.toCents,
    },
    spendCents: raise,
    title: `Change the daily budget from $${(proposal.fromCents / 100).toFixed(2)} to $${(proposal.toCents / 100).toFixed(2)}`,
    type: proposal.type,
  };
};

const optimizeCampaign = async (
  actor: Actor,
  call: ToolCall,
  row: CampaignRow,
  context: {
    budgets: Map<string, number>;
    deps: OptimizerDeps;
    now: Date;
  }
): Promise<CampaignOutcome> => {
  const { now } = context;
  const trace = new DecisionTrace(
    { userId: actor.userId },
    traceSinkFor(actor),
    () => new Date()
  );
  const sources = [
    { id: row.metaCampaignId, provider: "meta" as const, title: "campaign" },
  ];
  try {
    const read = await trace.call(
      {
        agent: AGENT,
        inputSummary: `campaign ${row.metaCampaignId}, ${row.adIds.length} ads`,
        step: "meta.read",
      },
      async () =>
        await readCampaign(call, {
          adAccountId: row.adAccountId,
          adIds: row.adIds,
          adSetId: row.adSetId,
          metaCampaignId: row.metaCampaignId,
        }),
      (result) => ({ output: result, sources })
    );
    const dailyBudgetCents = read.dailyBudgetCents ?? row.dailyBudgetCents;
    context.budgets.set(row.id, dailyBudgetCents);
    const [settings, spent, rows] = await Promise.all([
      autonomyOf(actor),
      spendToDate(actor, now),
      stateRows(actor, row.id),
    ]);
    const otherBudgetsCents = [...context.budgets]
      .filter(([id]) => id !== row.id)
      .reduce((total, [, cents]) => total + cents, 0);
    const assessment = assessCampaign(
      {
        adSetId: row.adSetId,
        ads: read.ads,
        dailyBudgetCents,
        lastEditAt: lastEditOf(rows),
        live: read.live,
        metaLearning: read.metaLearning,
        resultsLast7d: read.resultsLast7d,
      },
      { dailySpendCapCents: settings.dailySpendCapCents, otherBudgetsCents },
      { now, rng: context.deps.rng ?? Math.random }
    );
    await saveScores(
      actor,
      row,
      assessment,
      read,
      assessment.learning.learning
    );
    trace.add({
      agent: AGENT,
      inputSummary: `${read.ads.length} ads, budget ${dailyBudgetCents}c, cap ${settings.dailySpendCapCents}c`,
      output: {
        hold: assessment.hold,
        learning: assessment.learning,
        proposal: assessment.proposal,
        scores: assessment.scores,
      },
      sources: [{ provider: "rule", title: "Thompson sampling and guards" }],
      step: "assess",
    });
    const { proposal } = assessment;
    if (proposal === undefined) {
      return {
        campaignId: row.id,
        hold: assessment.hold ?? "no_change_warranted",
        outcome: "held",
      };
    }
    const review = await trace.call(
      {
        agent: "ads_optimizer_review",
        inputSummary: proposal.reason,
        model: actor.core.models.modelFor("reasoning"),
        step: "review",
      },
      async () =>
        await reviewProposal(
          actor.core.nemotron,
          { dailyBudgetCents, proposal, scores: assessment.scores },
          actor.log
        ),
      (result) => ({ output: result })
    );
    if (!review.approve) {
      return { campaignId: row.id, outcome: "vetoed", reason: review.reason };
    }
    const { approval, decision } = await approvalsFor(actor).enqueue(
      enqueueInput(actor, row, proposal, review.reason, isoDay(now)),
      settings,
      spent
    );
    trace.scope.approvalId = approval.id;
    trace.add({
      agent: "policy",
      inputSummary: `${proposal.type} at level ${settings.level}`,
      output: { decision, status: approval.status },
      sources: [{ provider: "rule", title: "canAutoExecute" }],
      step: "policy",
    });
    return {
      approvalId: approval.id,
      campaignId: row.id,
      outcome: "enqueued",
      status: approval.status,
    };
  } finally {
    await trace.flush();
  }
};

// Reviews the merchant's campaigns (or one); nothing with the flag off.
export const optimizeMerchant = async (
  actor: Actor,
  { campaignId }: { campaignId?: string | undefined } = {},
  deps: OptimizerDeps = {}
): Promise<CampaignOutcome[] | "flag_off"> => {
  if (!(await actor.core.flags.isOn("ads-optimizer", flagContextOf(actor)))) {
    return "flag_off";
  }
  const rows = await actor.db
    .select()
    .from(campaign)
    .where(eq(campaign.userId, actor.userId));
  const wanted =
    campaignId === undefined
      ? rows
      : rows.filter((row) => row.id === campaignId);
  if (wanted.length === 0) {
    return [];
  }
  // Every campaign's saved budget, replaced by Meta's as each is read: the
  // daily cap holds across all of them.
  const budgets = new Map(rows.map((row) => [row.id, row.dailyBudgetCents]));
  const now = (deps.now ?? (() => new Date()))();
  return await metaOf(
    actor,
    deps
  )(async (call) => {
    const outcomes: CampaignOutcome[] = [];
    for (const row of wanted) {
      try {
        // One campaign at a time: each reads the budgets before it.
        // oxlint-disable-next-line no-await-in-loop
        const outcome = await optimizeCampaign(actor, call, row, {
          budgets,
          deps,
          now,
        });
        outcomes.push(outcome);
      } catch (error) {
        // One campaign's failure (Meta, the reviewer) doesn't stop the
        // others; it goes to error tracking and its trace.
        evlog.error({
          campaignId: row.id,
          error: "ADS_OPTIMIZER_CAMPAIGN_FAILED",
          reason: messageOf(error),
          userId: actor.userId,
        });
        outcomes.push({
          campaignId: row.id,
          error: messageOf(error),
          outcome: "failed",
        });
      }
    }
    return outcomes;
  });
};

const pausePayload = z.object({
  adAccountId: z.string(),
  adId: z.string(),
  campaignId: z.string(),
});
const budgetPayload = z.object({
  adAccountId: z.string(),
  campaignId: z.string(),
  metaCampaignId: z.string(),
  toCents: z.number().int().positive(),
});

const isOptimizerAction = (type: string) =>
  (OPTIMIZER_ACTIONS as readonly string[]).includes(type);

// Marks the ad set as edited (the learning floor starts again), and a
// paused ad as paused.
const markEdited = async (
  actor: Actor,
  campaignId: string,
  at: Date,
  pausedAdId?: string
) => {
  const rows = await stateRows(actor, campaignId);
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop
    await actor.db
      .update(adOptimizerState)
      .set({
        params: { ...row.params, lastEditAt: at.toISOString() },
        ...(row.metaAdId === pausedAdId && { status: "paused" as const }),
      })
      .where(eq(adOptimizerState.id, row.id));
  }
};

const perform = async (
  call: ToolCall,
  approval: Approval
): Promise<{ campaignId: string; pausedAdId?: string }> => {
  if (approval.actionType === "media.ad.pause") {
    const payload = pausePayload.parse(approval.payload);
    await pauseAd(call, payload);
    return { campaignId: payload.campaignId, pausedAdId: payload.adId };
  }
  const payload = budgetPayload.parse(approval.payload);
  await setCampaignBudget(call, {
    adAccountId: payload.adAccountId,
    campaignId: payload.metaCampaignId,
    dailyBudgetCents: payload.toCents,
  });
  return { campaignId: payload.campaignId };
};

// Performs one approved optimizer action on Meta and records the outcome.
// Anything else (another proposer, a status past approved) is left alone,
// so a retried or duplicate event is a no-op.
export const executeOptimizerApproval = async (
  actor: Actor,
  approvalId: string,
  deps: OptimizerDeps = {}
): Promise<"skipped" | "done" | "failed"> => {
  const approvals = approvalsFor(actor);
  const approval = await approvals.get(actor.userId, approvalId);
  if (
    approval.proposedBy !== "optimizer" ||
    approval.status !== "approved" ||
    !isOptimizerAction(approval.actionType)
  ) {
    return "skipped";
  }
  const trace = new DecisionTrace(
    { approvalId, userId: actor.userId },
    traceSinkFor(actor)
  );
  await approvals.record({
    actor: AGENT,
    approvalId,
    status: "executing",
    userId: actor.userId,
  });
  try {
    const done = await trace.call(
      {
        agent: AGENT,
        inputSummary: `${approval.actionType} ${JSON.stringify(approval.payload)}`,
        step: "meta.write",
      },
      async () => await metaOf(actor, deps)((call) => perform(call, approval)),
      (result) => ({
        output: result,
        sources: [{ id: result.pausedAdId, provider: "meta" as const }],
      })
    );
    const at = (deps.now ?? (() => new Date()))();
    await markEdited(actor, done.campaignId, at, done.pausedAdId);
    await approvals.record({
      actor: AGENT,
      approvalId,
      result: done,
      status: "done",
      userId: actor.userId,
    });
    return "done";
  } catch (error) {
    evlog.error({
      actionType: approval.actionType,
      approvalId,
      error: "ADS_OPTIMIZER_WRITE_FAILED",
      reason: messageOf(error),
      userId: actor.userId,
    });
    await approvals.record({
      actor: AGENT,
      approvalId,
      error: messageOf(error),
      status: "failed",
      userId: actor.userId,
    });
    return "failed";
  } finally {
    await trace.flush();
  }
};
