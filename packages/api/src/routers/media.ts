import { ORPCError } from "@orpc/server";
import { ApprovalError } from "@wovain/core/approvals";
import { z } from "zod";

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
  sync: protectedProcedure
    .input(z.object({ campaignId: id }))
    .handler(
      async ({ context, input }) =>
        await syncCampaignStatus(context, input.campaignId)
    ),
};
