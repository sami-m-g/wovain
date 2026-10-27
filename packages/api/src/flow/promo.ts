import { polarPromoGateway, redeemPromo } from "@wovain/billing/redeem";
import type { RedeemResult, RedeemSurface } from "@wovain/billing/redeem";

import type { Actor } from "./actor";
import { requirePolar } from "./billing";

// Redeeming a promo code on the Billing page. It works while paid plans are
// off (billing-paid-plans), but then only for a code that makes the
// checkout free; the credits arrive by the webhook like a purchase.

const BILLING_PATH = "/dashboard/billing";

export const redeemCode = async (
  actor: Actor,
  { code, surface }: { code: string; surface: RedeemSurface }
): Promise<RedeemResult> => {
  const polar = requirePolar(actor);
  const returnUrl = `${actor.billing.appUrl}${BILLING_PATH}`;
  const result = await redeemPromo(actor.db, polarPromoGateway(polar), {
    code,
    paidPlans: await actor.billing.paidPlans(),
    returnUrl,
    successUrl: `${returnUrl}?redeemed=1`,
    surface,
    userId: actor.userId,
  });
  // The code itself stays out of the logs.
  actor.log?.set({
    billing: {
      redeem: {
        promo: "promoId" in result ? result.promoId : undefined,
        status: result.status,
        ...("refused" in result ? { refused: result.refused } : {}),
      },
    },
  });
  return result;
};
