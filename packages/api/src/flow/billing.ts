import { creditBalance } from "@wovain/billing/credits";
import { entitlement } from "@wovain/billing/mirror";
import { PLANS } from "@wovain/billing/plans";
import type { Offer } from "@wovain/billing/plans";
import { checkoutUrl, portalUrl } from "@wovain/billing/polar";
import type { Billing } from "@wovain/billing/service";
import { createError, defineError } from "evlog";

import type { Actor } from "./actor";
import { startFreePlan } from "./free-plan";

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

// Paid plans and packs aren't on sale yet (the billing-paid-plans flag):
// every merchant is on Free.
export const paidPlansNotAvailable = defineError("PAID_PLANS_NOT_AVAILABLE", {
  fix: "Free credits refresh every month. Paid plans and credit packs are coming soon.",
  message: "Paid plans aren't available yet",
  status: 403,
  why: "The billing-paid-plans flag is off.",
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
  // No plan mirrored yet: put them on Free, whose webhooks bring the plan
  // and the free credits; until then the merchant sees Free with what they
  // have.
  await startFreePlan(actor);
  const current = await entitlement(actor.db, actor.userId);
  const { subscription } = current;
  return {
    autopilot: PLANS[current.plan].autopilot,
    credits: await creditBalance(actor.db, actor.userId),
    enabled: polar !== undefined,
    paidPlans: actor.billing.paidPlans(),
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
  if (!actor.billing.paidPlans()) {
    actor.log?.set({ billing: { checkout: offer, refused: "paid_plans_off" } });
    throw paidPlansNotAvailable();
  }
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
