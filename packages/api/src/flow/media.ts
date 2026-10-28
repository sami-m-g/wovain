import type { StagedCampaign } from "@wovain/core/ads";
import { ApprovalError } from "@wovain/core/approvals";
import type { Approval } from "@wovain/core/approvals";
import {
  activateCampaign,
  pauseCampaign,
  readCampaignStatus,
} from "@wovain/core/media-buying";
import type { CampaignStatus } from "@wovain/core/media-buying";
import { DecisionTrace } from "@wovain/core/trace";
import { campaign } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError, log } from "evlog";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  requireAutonomyApprovals,
  spendToDate,
  traceSinkFor,
} from "./approvals";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";

// Live media buying (openspec change media-buying-live, flag
// media-buying-live): a staged campaign goes live only through the approval
// queue, inside the merchant's caps. The merchant asks (campaigns.activate),
// the queue decides (approvals.decide, or the policy), and the executor
// below publishes it on Meta when wovain/approval.decided says "approved"
// (../workflows/media.ts). Pausing is the safe direction: the merchant's own
// pause is approved and done at once.

type CampaignRow = typeof campaign.$inferSelect;

const EXECUTOR = "media_executor";
const MEDIA_ACTIONS = new Set([
  "media.campaign.activate",
  "media.campaign.pause",
]);
// Only a campaign that can't spend may be asked to go live.
const ACTIVATABLE = new Set<CampaignStatus>(["draft", "paused"]);
const CENTS_PER_DOLLAR = 100;

export const mediaBuyingOff = () =>
  createError({
    fix: "Turn on the media-buying-live flag for this environment.",
    message: "Live media buying isn't available yet",
    status: 404,
    why: "The media-buying-live flag is off.",
  });

export const isMediaBuyingLive = async (actor: Actor) =>
  await actor.core.flags.isOn("media-buying-live", flagContextOf(actor));

export const requireMediaBuying = async (actor: Actor) => {
  if (!(await isMediaBuyingLive(actor))) {
    throw mediaBuyingOff();
  }
};

const campaignNotFound = (id: string) =>
  createError({
    message: `No campaign ${id}`,
    status: 404,
    why: "This merchant has no campaign with that ID.",
  });

const campaignOf = async ({ db, userId }: Actor, id: string) => {
  const [row] = await db
    .select()
    .from(campaign)
    .where(and(eq(campaign.userId, userId), eq(campaign.id, id)));
  if (row === undefined) {
    throw campaignNotFound(id);
  }
  return row;
};

export const stagedOf = (row: CampaignRow): StagedCampaign => ({
  adAccountId: row.adAccountId,
  adIds: row.adIds,
  adSetId: row.adSetId,
  campaignId: row.metaCampaignId,
  creativeIds: row.creativeIds,
  pageId: row.pageId,
});

const saveStatus = async (
  { db, userId }: Actor,
  id: string,
  status: CampaignStatus
) => {
  const [row] = await db
    .update(campaign)
    .set({ status })
    .where(and(eq(campaign.userId, userId), eq(campaign.id, id)))
    .returning();
  if (row === undefined) {
    throw campaignNotFound(id);
  }
  return row;
};

// Reads the campaign's delivery back from Meta and saves it.
export const syncCampaignStatus = async (actor: Actor, id: string) => {
  await requireMediaBuying(actor);
  const row = await campaignOf(actor, id);
  const status = await withProvider(
    actor,
    "meta",
    async (call) => await readCampaignStatus(call, stagedOf(row))
  );
  return await saveStatus(actor, row.id, status);
};

const dollars = (cents: number) => (cents / CENTS_PER_DOLLAR).toFixed(2);

// Asks to take a staged campaign live: an R2, spending approval that waits
// for the merchant (or is denied at once over a cap).
export const requestCampaignActivation = async (
  actor: Actor,
  { campaignId, requestId }: { campaignId: string; requestId: string }
): Promise<Approval> => {
  await requireMediaBuying(actor);
  await requireAutonomyApprovals(actor);
  const row = await campaignOf(actor, campaignId);
  if (!ACTIVATABLE.has(row.status)) {
    throw notReady({
      fix: "Sync the campaign's status; only a paused or draft campaign can be started.",
      message: `The campaign is ${row.status}`,
    });
  }
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  const { approval } = await approvalsFor(actor).enqueue(
    {
      costPreview: {
        amountCents: row.dailyBudgetCents,
        currency: "USD",
        label: `$${dollars(row.dailyBudgetCents)} a day, billed by Meta to your ad account`,
      },
      idempotencyKey: `media.campaign.activate:${row.id}:${requestId}`,
      inverse: { campaignId: row.id, type: "media.campaign.pause" },
      payload: {
        campaignId: row.id,
        dailyBudgetCents: row.dailyBudgetCents,
        metaCampaignId: row.metaCampaignId,
      },
      proposedBy: "merchant",
      reason: "You asked to start this campaign.",
      spendCents: row.dailyBudgetCents,
      title: `Start the Meta campaign at $${dollars(row.dailyBudgetCents)} a day`,
      type: "media.campaign.activate",
      userId: actor.userId,
    },
    settings,
    spent
  );
  return approval;
};

const perform = async (
  actor: Actor,
  item: Approval,
  row: CampaignRow
): Promise<CampaignStatus> => {
  const staged = stagedOf(row);
  const trace = new DecisionTrace(
    { approvalId: item.id, userId: actor.userId },
    traceSinkFor(actor)
  );
  const activate = item.actionType === "media.campaign.activate";
  try {
    return await trace.call(
      {
        agent: EXECUTOR,
        inputSummary: `${item.actionType} on Meta campaign ${row.metaCampaignId} ($${dollars(row.dailyBudgetCents)}/day)`,
        step: activate ? "activate" : "pause",
      },
      async () =>
        await withProvider(actor, "meta", async (call) => {
          await (activate
            ? activateCampaign(call, staged)
            : pauseCampaign(call, staged));
          return await readCampaignStatus(call, staged);
        }),
      (status) => ({
        output: { status },
        sources: [{ id: row.metaCampaignId, provider: "meta" as const }],
      })
    );
  } finally {
    await trace.flush();
  }
};

const startExecuting = async (actor: Actor, item: Approval) => {
  try {
    await approvalsFor(actor).record({
      actor: EXECUTOR,
      approvalId: item.id,
      status: "executing",
      userId: actor.userId,
    });
    return true;
  } catch (error) {
    // Another delivery of the same event got there first.
    if (error instanceof ApprovalError && error.code === "BAD_TRANSITION") {
      return false;
    }
    throw error;
  }
};

// Carries out an approved media action once: publishes or pauses the
// campaign, reads its status back and records the outcome. A failure is
// logged at error level and recorded on the approval.
export const executeMediaApproval = async (
  actor: Actor,
  approvalId: string
): Promise<Approval> => {
  const approvals = approvalsFor(actor);
  const item = await approvals.get(actor.userId, approvalId);
  if (!MEDIA_ACTIONS.has(item.actionType) || item.status !== "approved") {
    return item;
  }
  if (!(await startExecuting(actor, item))) {
    return await approvals.get(actor.userId, approvalId);
  }
  try {
    if (
      item.actionType === "media.campaign.activate" &&
      !(await isMediaBuyingLive(actor))
    ) {
      throw mediaBuyingOff();
    }
    const campaignId = String(item.payload["campaignId"] ?? "");
    const row = await campaignOf(actor, campaignId);
    const status = await perform(actor, item, row);
    await saveStatus(actor, row.id, status);
    return await approvals.record({
      actor: EXECUTOR,
      approvalId,
      result: { campaignId: row.id, status },
      status: "done",
      userId: actor.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({
      error: {
        code: "MEDIA_ACTION_FAILED",
        message: `${item.actionType} failed: ${message}`,
        name: "MediaActionFailed",
        ...(error instanceof Error && error.stack !== undefined
          ? { stack: error.stack }
          : {}),
      },
      media: { actionType: item.actionType, approvalId },
    });
    return await approvals.record({
      actor: EXECUTOR,
      approvalId,
      error: message,
      status: "failed",
      userId: actor.userId,
    });
  }
};

// The merchant pauses their own campaign: queued and audited like every
// action, approved by them at once, and carried out now.
export const pauseCampaignNow = async (
  actor: Actor,
  { campaignId, requestId }: { campaignId: string; requestId: string }
): Promise<Approval> => {
  await requireMediaBuying(actor);
  await requireAutonomyApprovals(actor);
  const row = await campaignOf(actor, campaignId);
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  const approvals = approvalsFor(actor);
  const { approval } = await approvals.enqueue(
    {
      idempotencyKey: `media.campaign.pause:${row.id}:${requestId}`,
      payload: { campaignId: row.id, metaCampaignId: row.metaCampaignId },
      proposedBy: "merchant",
      reason: "You asked to pause this campaign.",
      title: "Pause the Meta campaign",
      type: "media.campaign.pause",
      userId: actor.userId,
    },
    settings,
    spent
  );
  if (approval.status === "pending") {
    await approvals.decide(
      {
        approvalId: approval.id,
        approve: true,
        decidedBy: actor.userId,
        userId: actor.userId,
      },
      settings,
      spent
    );
  }
  return await executeMediaApproval(actor, approval.id);
};
