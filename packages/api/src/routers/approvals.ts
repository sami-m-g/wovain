import { ORPCError } from "@orpc/server";
import { APPROVAL_STATUSES, ApprovalError } from "@wovain/core/approvals";
import type { ApprovalErrorCode } from "@wovain/core/approvals";
import { ACTION_DOMAINS, AUTONOMY_LEVELS } from "@wovain/core/autonomy";
import { z } from "zod";

import {
  approvalsFor,
  autonomyOf,
  requireAutonomyApprovals,
  setAutonomy,
  spendToDate,
} from "../flow/approvals";
import { protectedProcedure } from "../index";

// The merchant's side of the approval queue and their autonomy settings
// (openspec foundation-autonomy-approvals), behind the autonomy-approvals
// flag. Agents enqueue through ../flow/approvals; executors listen for
// wovain/approval.decided.

const ORPC_CODE: Record<ApprovalErrorCode, string> = {
  BAD_TRANSITION: "CONFLICT",
  DENIED: "FORBIDDEN",
  EXPIRED: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  NOT_PENDING: "CONFLICT",
};

// The queue's refusals as oRPC errors the client can read by `data.reason`.
const asOrpc = (error: unknown): never => {
  if (error instanceof ApprovalError) {
    throw new ORPCError(ORPC_CODE[error.code], {
      cause: error,
      data: { reason: error.code },
      message: error.message,
    });
  }
  throw error;
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
// $1,000,000 a day: far above any merchant's cap, to refuse typos.
const MAX_CAP_CENTS = 100_000_000;

export const approvalsRouter = {
  decide: protectedProcedure
    .input(
      z.object({
        approvalId: z.string().min(1),
        approve: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      await requireAutonomyApprovals(context);
      const [settings, spent] = await Promise.all([
        autonomyOf(context),
        spendToDate(context),
      ]);
      try {
        return await approvalsFor(context).decide(
          { ...input, decidedBy: context.userId, userId: context.userId },
          settings,
          spent
        );
      } catch (error) {
        return asOrpc(error);
      }
    }),
  list: protectedProcedure
    .input(
      z.object({
        domain: z.enum(ACTION_DOMAINS).optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
        statuses: z.array(z.enum(APPROVAL_STATUSES)).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      await requireAutonomyApprovals(context);
      return await approvalsFor(context).list({
        ...input,
        userId: context.userId,
      });
    }),
};

export const autonomyRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    await requireAutonomyApprovals(context);
    return await autonomyOf(context);
  }),
  set: protectedProcedure
    .input(
      z
        .object({
          dailySpendCapCents: z.number().int().min(0).max(MAX_CAP_CENTS),
          level: z.enum(AUTONOMY_LEVELS),
          monthlySpendCapCents: z.number().int().min(0).max(MAX_CAP_CENTS),
          paused: z.boolean(),
        })
        .refine(
          (value) => value.monthlySpendCapCents >= value.dailySpendCapCents,
          {
            message: "The monthly cap can't be below the daily cap",
            path: ["monthlySpendCapCents"],
          }
        )
    )
    .handler(async ({ context, input }) => {
      await requireAutonomyApprovals(context);
      return await setAutonomy(context, input);
    }),
};
