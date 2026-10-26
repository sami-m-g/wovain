import { OFFERS } from "@wovain/billing/plans";
import { REDEEM_LIMIT, REDEEM_SURFACES } from "@wovain/billing/redeem";
import { z } from "zod";

import { billingStatus, openPortal, startCheckout } from "../flow/billing";
import { redeemCode } from "../flow/promo";
import { protectedProcedure } from "../index";

// Why a promo code was refused, as typed oRPC errors: the Billing page
// reads `code` and words it in the merchant's language.
const redeemErrors = {
  PROMO_ALREADY_REDEEMED: {
    message: "You've already redeemed this code",
    status: 409,
  },
  PROMO_EXPIRED: { message: "This code has expired", status: 410 },
  PROMO_INVALID: { message: "This code isn't valid", status: 404 },
  PROMO_NOT_FREE: {
    message: "Only codes that make credits free can be redeemed for now",
    status: 403,
  },
  PROMO_USED_UP: {
    message: "This code has been redeemed as many times as it can be",
    status: 410,
  },
  TOO_MANY_REQUESTS: {
    data: z.object({ retryAfterSeconds: z.number() }),
    message: "Too many codes tried. Wait a few minutes, then try again.",
    status: 429,
  },
} as const;

// Polar's codes are short; anything longer is not a code.
const MAX_CODE_LENGTH = 64;

// wovain's own plan and credits (Polar): what the merchant has, a checkout
// for a plan or a credit pack, a promo code, and the customer portal.
export const billingRouter = {
  checkout: protectedProcedure
    .input(z.object({ offer: z.enum(OFFERS) }))
    .handler(
      async ({ context, input }) => await startCheckout(context, input.offer)
    ),
  portal: protectedProcedure.handler(
    async ({ context }) => await openPortal(context)
  ),
  redeem: protectedProcedure
    .errors(redeemErrors)
    .input(
      z.object({
        code: z.string().trim().min(1).max(MAX_CODE_LENGTH),
        surface: z.enum(REDEEM_SURFACES).default("billing"),
      })
    )
    .handler(async ({ context, errors, input }) => {
      const result = await redeemCode(context, input);
      switch (result.status) {
        case "rate_limited": {
          throw errors.TOO_MANY_REQUESTS({
            data: { retryAfterSeconds: REDEEM_LIMIT.windowMs / 1000 },
          });
        }
        case "refused": {
          const refusal = {
            already_redeemed: errors.PROMO_ALREADY_REDEEMED,
            expired: errors.PROMO_EXPIRED,
            invalid: errors.PROMO_INVALID,
            not_free: errors.PROMO_NOT_FREE,
            used_up: errors.PROMO_USED_UP,
          }[result.refused];
          throw refusal();
        }
        case "checkout": {
          return {
            credits: result.credits,
            status: "checkout" as const,
            url: result.url,
          };
        }
        default: {
          return { credits: result.credits, status: "redeemed" as const };
        }
      }
    }),
  status: protectedProcedure.handler(
    async ({ context }) => await billingStatus(context)
  ),
};
