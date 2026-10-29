import { ORPCError } from "@orpc/server";
import { targetsOf } from "@wovain/core/ad-rules";
import { ApprovalError } from "@wovain/core/approvals";
import { campaign } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  adRulesOf,
  economicsOf,
  isAdRulesOn,
  setLossLimit,
} from "../flow/ad-rules";
import { autonomyOf } from "../flow/approvals";
import { flagContextOf } from "../flow/flags";
import {
  isMediaBuyingLive,
  pauseCampaignNow,
  requestCampaignActivation,
  syncCampaignStatus,
} from "../flow/media";
import { protectedProcedure } from "../index";

// Live media buying on a staged campaign (openspec change
// media-buying-live), behind the media-buying-live and autonomy-approvals
// flags. `activate` only asks: the campaign goes live when the approval is
// approved (approvals.decide), inside the merchant's caps.

const id = z.string().min(1).max(64);
// Makes a request idempotent (AIP-155): the same ID returns the same approval.
const requestId = z.uuid();
const byCampaign = z.object({ campaignId: id, requestId });
// The highest loss limit a merchant may set: $100,000.
const MAX_LOSS_LIMIT_CENTS = 10_000_000;

// The queue's refusals (a cap breach is DENIED) as oRPC errors.
const asOrpc = (error: unknown): never => {
  if (error instanceof ApprovalError) {
    throw new ORPCError(error.code === "DENIED" ? "FORBIDDEN" : "CONFLICT", {
      cause: error,
      data: { reason: error.code },
      message: error.message,
    });
  }
  throw error;
};

export const mediaCampaignsRouter = {
  activate: protectedProcedure
    .input(byCampaign)
    .handler(async ({ context, input }) => {
      try {
        return await requestCampaignActivation(context, input);
      } catch (error) {
        return asOrpc(error);
      }
    }),
  // Whether the merchant can start and pause campaigns from wovain.
  liveBuying: protectedProcedure.handler(async ({ context }) => {
    const [media, approvals] = await Promise.all([
      isMediaBuyingLive(context),
      context.core.flags.isOn("autonomy-approvals", flagContextOf(context)),
    ]);
    return { available: media && approvals };
  }),
  pause: protectedProcedure
    .input(byCampaign)
    .handler(async ({ context, input }) => {
      try {
        return await pauseCampaignNow(context, input);
      } catch (error) {
        return asOrpc(error);
      }
    }),
  // The profit rules for one campaign, in numbers the card states plainly:
  // the thresholds, the target CPA and ROAS from its product, and the caps.
  rules: protectedProcedure
    .input(z.object({ campaignId: id }))
    .handler(async ({ context, input }) => {
      if (!(await isAdRulesOn(context))) {
        return { on: false as const };
      }
      const [row] = await context.db
        .select({ productId: campaign.productId })
        .from(campaign)
        .where(
          and(
            eq(campaign.userId, context.userId),
            eq(campaign.id, input.campaignId)
          )
        );
      if (row === undefined) {
        throw new ORPCError("NOT_FOUND", {
          message: `No campaign ${input.campaignId}`,
        });
      }
      const [settings, economics, autonomy] = await Promise.all([
        adRulesOf(context),
        economicsOf(context, [row.productId]),
        autonomyOf(context),
      ]);
      const unit = economics.get(row.productId);
      return {
        dailySpendCapCents: autonomy.dailySpendCapCents,
        monthlySpendCapCents: autonomy.monthlySpendCapCents,
        on: true as const,
        settings,
        targets: unit === undefined ? undefined : targetsOf(unit, settings),
      };
    }),
  setLossLimit: protectedProcedure
    .input(
      z.object({
        lossLimitCents: z.number().int().min(0).max(MAX_LOSS_LIMIT_CENTS),
      })
    )
    .handler(
      async ({ context, input }) =>
        await setLossLimit(context, input.lossLimitCents)
    ),
  sync: protectedProcedure
    .input(z.object({ campaignId: id }))
    .handler(
      async ({ context, input }) =>
        await syncCampaignStatus(context, input.campaignId)
    ),
};
