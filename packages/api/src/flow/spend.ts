import {
  creditBalance,
  releaseCredits,
  reserveCredits,
  settleCredits,
} from "@wovain/billing/credits";
import { entitlement } from "@wovain/billing/mirror";
import { CREDIT_COST, PLANS } from "@wovain/billing/plans";
import type { CreditStep } from "@wovain/billing/plans";
import { reportUsage } from "@wovain/billing/polar";
import { refusalError } from "@wovain/billing/refusals";
import { user } from "@wovain/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";

// Paid steps spend the merchant's credits: reserved before the step runs,
// settled when it succeeds, given back when it fails. The reservation is
// atomic (packages/billing/src/credits.ts), so concurrent steps can't
// overspend, and Polar's grants (mirrored by its webhooks) are the only way
// credits arrive.

const merchantOf = async ({ db, userId }: Actor) => {
  const [row] = await db
    .select({ emailVerified: user.emailVerified, locale: user.locale })
    .from(user)
    .where(eq(user.id, userId));
  if (row === undefined) {
    throw new Error(`No user ${userId}`);
  }
  if (!row.emailVerified) {
    throw refusalError("email_not_verified", row.locale);
  }
  return row;
};

// Refuses early, before anything is saved, when the merchant can't afford the
// step (a run's research). The step itself still reserves its credits.
export const assertCredits = async (actor: Actor, step: CreditStep) => {
  const merchant = await merchantOf(actor);
  const { available } = await creditBalance(actor.db, actor.userId);
  if (available < CREDIT_COST[step]) {
    throw refusalError("out_of_credits", merchant.locale, {
      available,
      needed: CREDIT_COST[step],
      paid: actor.billing.paidPlans(),
    });
  }
};

// Autopilot is a paid-plan feature.
export const assertAutopilot = async (actor: Actor) => {
  const merchant = await merchantOf(actor);
  const { plan } = await entitlement(actor.db, actor.userId);
  if (!PLANS[plan].autopilot) {
    throw refusalError("plan_required", merchant.locale, {
      paid: actor.billing.paidPlans(),
    });
  }
};

// Runs a paid step on the merchant's credits.
export const charge = async <T>(
  actor: Actor,
  step: CreditStep,
  { runId }: { runId?: string | null | undefined },
  work: () => Promise<T>
): Promise<T> => {
  const merchant = await merchantOf(actor);
  const held = await reserveCredits(actor.db, {
    runId,
    step,
    userId: actor.userId,
  });
  if (!held.ok) {
    actor.log?.set({
      credits: { available: held.available, needed: held.needed, step },
    });
    throw refusalError("out_of_credits", merchant.locale, {
      ...held,
      paid: actor.billing.paidPlans(),
    });
  }
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await releaseCredits(actor.db, held.id);
    throw error;
  }
  const settled = await settleCredits(actor.db, held.id);
  actor.log?.set({ credits: { left: held.available, spent: step } });
  if (settled !== undefined) {
    actor.analytics?.capture({
      distinctId: actor.userId,
      event: "credits_consumed",
      properties: {
        balance_after: held.available,
        credits: settled.credits,
        run_id: runId ?? null,
        step,
      },
    });
  }
  const { polar } = actor.billing;
  if (settled !== undefined && polar !== undefined) {
    // Polar's meter is a mirror for the customer portal; Postgres already
    // holds the spend, so a failed report is logged, not thrown.
    try {
      await reportUsage(polar, {
        credits: settled.credits,
        reservationId: held.id,
        step,
        userId: actor.userId,
      });
    } catch (error) {
      actor.log?.set({
        polar: {
          usageFailed: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return result;
};
