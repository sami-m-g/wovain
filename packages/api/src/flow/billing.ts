import { creditBalance } from "@wovain/billing/credits";
import { entitlement, merchantOf } from "@wovain/billing/mirror";
import { PLANS } from "@wovain/billing/plans";
import type { Offer } from "@wovain/billing/plans";
import { checkoutUrl, ensureFreePlan, portalUrl } from "@wovain/billing/polar";
import type { Billing } from "@wovain/billing/service";
import { createError } from "evlog";

import type { Actor } from "./actor";

// The merchant's plan and credits, and the ways to change them: Polar's
// hosted checkout and customer portal. The plan and credits shown are the
// webhook-fed mirror in Postgres, so a checkout shows up a moment after
// Polar confirms it.

const notConfigured = () =>
  createError({
    code: "POLAR_NOT_CONFIGURED",
    fix: "Set POLAR_ACCESS_TOKEN (and POLAR_ENVIRONMENT) for the web app, then run pnpm polar:seed.",
    message: "Billing isn't set up on this server",
    status: 503,
    why: "POLAR_ACCESS_TOKEN is not set.",
  });

const requirePolar = (actor: Actor): NonNullable<Billing["polar"]> => {
  const { polar } = actor.billing;
  if (polar === undefined) {
    throw notConfigured();
  }
  return polar;
};

export const billingStatus = async (actor: Actor) => {
  const { polar } = actor.billing;
  let current = await entitlement(actor.db, actor.userId);
  // No plan mirrored yet (an account from before billing, or webhooks still
  // on their way): make sure Polar has them on Free. Its webhooks bring the
  // plan and the free credits; until then the merchant sees Free with what
  // they have.
  if (current.subscription === null && polar !== undefined) {
    const merchant = await merchantOf(actor.db, actor.userId);
    if (merchant !== undefined) {
      try {
        await ensureFreePlan(polar, merchant);
      } catch (error) {
        actor.log?.set({
          polar: {
            freePlanFailed:
              error instanceof Error ? error.message : String(error),
          },
        });
      }
      current = await entitlement(actor.db, actor.userId);
    }
  }
  const { subscription } = current;
  return {
    autopilot: PLANS[current.plan].autopilot,
    credits: await creditBalance(actor.db, actor.userId),
    enabled: polar !== undefined,
    plan: current.plan,
    subscription:
      subscription === null
        ? null
        : {
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            status: subscription.status,
          },
  };
};

const BILLING_PATH = "/dashboard/billing";

export const startCheckout = async (actor: Actor, offer: Offer) => {
  const polar = requirePolar(actor);
  const returnUrl = `${actor.billing.appUrl}${BILLING_PATH}`;
  const current = await entitlement(actor.db, actor.userId);
  // A paid merchant changes plan in the portal, where Polar prorates it.
  if (offer !== "pack" && current.plan !== "free") {
    return { url: await portalUrl(polar, { returnUrl, userId: actor.userId }) };
  }
  const freeSubscriptionId =
    current.plan === "free" ? current.subscription?.id : undefined;
  const url = await checkoutUrl(polar, {
    freeSubscriptionId,
    offer,
    returnUrl,
    successUrl: `${returnUrl}?checkout=success`,
    userId: actor.userId,
  });
  actor.log?.set({ billing: { checkout: offer, from: current.plan } });
  return { url };
};

export const openPortal = async (actor: Actor) => {
  const polar = requirePolar(actor);
  return {
    url: await portalUrl(polar, {
      returnUrl: `${actor.billing.appUrl}${BILLING_PATH}`,
      userId: actor.userId,
    }),
  };
};
