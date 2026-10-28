import type { Approval } from "@wovain/core/approvals";
import type { ActionType } from "@wovain/core/autonomy";
import {
  assessCampaign,
  learningReasons,
  pauseBlockedBy,
  reviewProposal,
} from "@wovain/core/optimizer";
import type { Assessment, Proposal, Rng } from "@wovain/core/optimizer";
import {
  pauseAd,
  readCampaign,
  setCampaignBudget,
} from "@wovain/core/optimizer-meta";
import { DecisionTrace } from "@wovain/core/trace";
import type { ToolCall } from "@wovain/core/upstream";
import {
  adOptimizerState,
  approval as approvalTable,
} from "@wovain/db/schema/autonomy";
import { campaign } from "@wovain/db/schema/seller";
import { and, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
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

// An optimizer approval the merchant hasn't decided within a day lapses:
// the next tick proposes again from fresh data.
const APPROVAL_TTL_MS = 86_400_000;

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

const nowOf = (deps: OptimizerDeps) => (deps.now ?? (() => new Date()))();

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

// The campaign's optimizer approval still waiting or running, if any. One
// change per campaign: while one is outstanding, nothing new is proposed.
const outstandingApproval = async (
  { db, userId }: Actor,
  campaignId: string,
  now: Date
) => {
  const [row] = await db
    .select({ id: approvalTable.id })
    .from(approvalTable)
    .where(
      and(
        eq(approvalTable.userId, userId),
        eq(approvalTable.proposedBy, "optimizer"),
        sql`${approvalTable.payload}->>'campaignId' = ${campaignId}`,
        or(
          inArray(approvalTable.status, ["approved", "executing"]),
          and(
            eq(approvalTable.status, "pending"),
            or(
              isNull(approvalTable.expiresAt),
              gt(approvalTable.expiresAt, now)
            )
          )
        )
      )
    )
    .limit(1);
  return row?.id;
};

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

// Keeps the saved daily budget at Meta's latest, so the cap check before
// an approved raise sums current budgets.
const saveBudget = async (actor: Actor, campaignId: string, cents: number) => {
  await actor.db
    .update(campaign)
    .set({ dailyBudgetCents: cents })
    .where(and(eq(campaign.userId, actor.userId), eq(campaign.id, campaignId)));
};

const enqueueInput = (
  actor: Actor,
  row: CampaignRow,
  proposal: Proposal,
  review: string,
  now: Date
) => {
  const day = isoDay(now);
  const base = {
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
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
    if (dailyBudgetCents !== row.dailyBudgetCents) {
      await saveBudget(actor, row.id, dailyBudgetCents);
    }
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
    const outstanding = await outstandingApproval(actor, row.id, now);
    if (outstanding !== undefined) {
      trace.add({
        agent: AGENT,
        inputSummary: `${proposal.type} while approval ${outstanding} is outstanding`,
        output: { hold: "approval_outstanding", outstanding },
        sources: [{ provider: "rule", title: "One change per campaign" }],
        step: "guard",
      });
      return {
        campaignId: row.id,
        hold: "approval_outstanding",
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
      enqueueInput(actor, row, proposal, review.reason, now),
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
  const now = nowOf(deps);
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
  fromCents: z.number().int().nonnegative(),
  metaCampaignId: z.string(),
  toCents: z.number().int().positive(),
});
const campaignPayload = z.object({ campaignId: z.string() }).loose();

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

// The daily budgets of the merchant's other wovain campaigns, as saved.
const otherBudgetsOf = async (actor: Actor, campaignId: string) => {
  const rows = await actor.db
    .select({ cents: campaign.dailyBudgetCents })
    .from(campaign)
    .where(and(eq(campaign.userId, actor.userId), ne(campaign.id, campaignId)));
  return rows.reduce((total, row) => total + row.cents, 0);
};

// Why an approved action may no longer run: the guards it was proposed
// under, checked again on Meta's latest data. An approval can wait a while,
// and another change may have landed since.
const staleReasons = async (
  actor: Actor,
  call: ToolCall,
  approval: Approval,
  now: Date
): Promise<string[]> => {
  const { campaignId } = campaignPayload.parse(approval.payload);
  const [row] = await actor.db
    .select()
    .from(campaign)
    .where(and(eq(campaign.userId, actor.userId), eq(campaign.id, campaignId)));
  if (row === undefined) {
    return [`campaign ${campaignId} no longer exists`];
  }
  const [read, rows] = await Promise.all([
    readCampaign(call, {
      adAccountId: row.adAccountId,
      adIds: row.adIds,
      adSetId: row.adSetId,
      metaCampaignId: row.metaCampaignId,
    }),
    stateRows(actor, row.id),
  ]);
  const why = learningReasons(
    {
      lastEditAt: lastEditOf(rows),
      metaLearning: read.metaLearning,
      resultsLast7d: read.resultsLast7d,
    },
    now
  );
  if (!read.live) {
    why.push("the campaign is not active on Meta");
  }
  if (approval.actionType === "media.ad.pause") {
    const { adId } = pausePayload.parse(approval.payload);
    const blocked = pauseBlockedBy(read.ads, adId);
    if (blocked !== undefined) {
      why.push(`ad ${adId} can't be paused now (${blocked})`);
    }
    return why;
  }
  const { fromCents, toCents } = budgetPayload.parse(approval.payload);
  const current = read.dailyBudgetCents ?? row.dailyBudgetCents;
  if (current !== fromCents) {
    why.push(
      `the daily budget is ${current}c, not the ${fromCents}c the change was proposed on`
    );
  }
  // A cut only lowers spend; a raise must still fit under the daily cap.
  if (toCents > fromCents) {
    const [settings, others] = await Promise.all([
      autonomyOf(actor),
      otherBudgetsOf(actor, row.id),
    ]);
    if (toCents + others > settings.dailySpendCapCents) {
      why.push(
        `${toCents}c plus the other campaigns' ${others}c is past the ${settings.dailySpendCapCents}c daily cap`
      );
    }
  }
  return why;
};

const perform = async (
  call: ToolCall,
  approval: Approval
): Promise<{
  campaignId: string;
  dailyBudgetCents?: number;
  pausedAdId?: string;
}> => {
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
  return {
    campaignId: payload.campaignId,
    dailyBudgetCents: payload.toCents,
  };
};

// What the Meta-write half of the executor did. JSON-safe, so an Inngest
// step can memoize it.
export type OptimizerWrite =
  | { kind: "skipped" | "failed" | "stale" }
  | {
      at: string;
      campaignId: string;
      dailyBudgetCents?: number;
      kind: "written";
      pausedAdId?: string;
    };

// Checks an approved optimizer action again and performs it on Meta.
// Anything else (another proposer, a status past approved) is left alone,
// so a retried or duplicate event is a no-op. A stale action (learning
// again, the budget moved, past the cap, the ad now the one Meta favors)
// is recorded failed and not written.
export const writeOptimizerApproval = async (
  actor: Actor,
  approvalId: string,
  deps: OptimizerDeps = {}
): Promise<OptimizerWrite> => {
  const approvals = approvalsFor(actor);
  const approval = await approvals.get(actor.userId, approvalId);
  if (
    approval.proposedBy !== "optimizer" ||
    approval.status !== "approved" ||
    !isOptimizerAction(approval.actionType)
  ) {
    return { kind: "skipped" };
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
  const now = nowOf(deps);
  try {
    const outcome = await metaOf(
      actor,
      deps
    )(async (call) => {
      const stale = await trace.call(
        {
          agent: AGENT,
          inputSummary: `${approval.actionType} approved ${approval.decidedAt?.toISOString() ?? ""}`,
          step: "recheck",
        },
        async () => await staleReasons(actor, call, approval, now),
        (result) => ({
          output: result,
          sources: [{ provider: "rule" as const, title: "Guards, again" }],
        })
      );
      if (stale.length > 0) {
        return { stale };
      }
      const done = await trace.call(
        {
          agent: AGENT,
          inputSummary: `${approval.actionType} ${JSON.stringify(approval.payload)}`,
          step: "meta.write",
        },
        async () => await perform(call, approval),
        (result) => ({
          output: result,
          sources: [{ id: result.pausedAdId, provider: "meta" as const }],
        })
      );
      return { done };
    });
    if ("stale" in outcome) {
      evlog.warn({
        actionType: approval.actionType,
        approvalId,
        error: "ADS_OPTIMIZER_APPROVAL_STALE",
        reason: outcome.stale.join("; "),
        userId: actor.userId,
      });
      await approvals.record({
        actor: AGENT,
        approvalId,
        error: `Not run, the approval is stale: ${outcome.stale.join("; ")}`,
        status: "failed",
        userId: actor.userId,
      });
      return { kind: "stale" };
    }
    return { at: now.toISOString(), kind: "written", ...outcome.done };
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
    return { kind: "failed" };
  } finally {
    await trace.flush();
  }
};

// The bookkeeping after a Meta write: the learning floor starts again, the
// saved budget follows, then the approval is done. Safe to retry: a failure
// here is logged and thrown, never recorded as a failed write, since Meta
// already changed.
export const finishOptimizerApproval = async (
  actor: Actor,
  approvalId: string,
  write: Extract<OptimizerWrite, { kind: "written" }>
) => {
  try {
    await markEdited(
      actor,
      write.campaignId,
      new Date(write.at),
      write.pausedAdId
    );
    if (write.dailyBudgetCents !== undefined) {
      await saveBudget(actor, write.campaignId, write.dailyBudgetCents);
    }
    const approvals = approvalsFor(actor);
    const current = await approvals.get(actor.userId, approvalId);
    if (current.status === "executing") {
      await approvals.record({
        actor: AGENT,
        approvalId,
        result: write,
        status: "done",
        userId: actor.userId,
      });
    }
  } catch (error) {
    evlog.error({
      approvalId,
      error: "ADS_OPTIMIZER_POST_WRITE_FAILED",
      reason: messageOf(error),
      userId: actor.userId,
    });
    throw error;
  }
};

// Performs one approved optimizer action and records the outcome.
export const executeOptimizerApproval = async (
  actor: Actor,
  approvalId: string,
  deps: OptimizerDeps = {}
): Promise<"skipped" | "done" | "failed" | "stale"> => {
  const write = await writeOptimizerApproval(actor, approvalId, deps);
  if (write.kind !== "written") {
    return write.kind;
  }
  await finishOptimizerApproval(actor, approvalId, write);
  return "done";
};
