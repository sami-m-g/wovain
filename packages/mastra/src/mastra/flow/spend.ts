import { billingCatalog, creditCostOf } from "@wovain/billing/catalog";
import {
  releaseCredits,
  reserveCredits,
  settleCredits,
} from "@wovain/billing/credits";
import { entitlement } from "@wovain/billing/mirror";
import type { CreditStep } from "@wovain/billing/plans";
import { reportUsage } from "@wovain/billing/polar";
import { refusalError } from "@wovain/billing/refusals";
import { user } from "@wovain/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { awaitFreeCredits } from "./free-plan";

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
// step (a run's research), and the steps that must follow it (a Home pick's
// first design). Each step itself still reserves its credits.
export const assertCredits = async (
  actor: Actor,
  step: CreditStep,
  ...after: CreditStep[]
) => {
  const merchant = await merchantOf(actor);
  const needed = [step, ...after].reduce(
    (total, each) => total + creditCostOf(each),
    0
  );
  const available = await awaitFreeCredits(actor, needed);
  if (available < needed) {
    throw refusalError("out_of_credits", merchant.locale, {
      available,
      needed,
      paid: await actor.billing.paidPlans(),
    });
  }
};

// Autopilot comes with the plan, or with the autopilot flag (on for every
// plan, Free included, in dev and next).
export const autopilotEntitled = async (actor: Actor) => {
  const { plan } = await entitlement(actor.db, actor.userId);
  return (
    billingCatalog().plans[plan].autopilot ||
    (await actor.core.flags.isOn("autopilot", { plan, userId: actor.userId }))
  );
};

export const assertAutopilot = async (actor: Actor) => {
  const merchant = await merchantOf(actor);
  if (!(await autopilotEntitled(actor))) {
    throw refusalError("plan_required", merchant.locale, {
      paid: await actor.billing.paidPlans(),
    });
  }
};

// Runs a paid step on the merchant's credits. A step whose result gave the
// merchant nothing (`refundIf`) is given back like a failed one.
export const charge = async <T>(
  actor: Actor,
  step: CreditStep,
  {
    refundIf,
    runId,
  }: {
    refundIf?: (result: T) => boolean;
    runId?: string | null | undefined;
  },
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
      paid: await actor.billing.paidPlans(),
    });
  }
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await releaseCredits(actor.db, held.id);
    throw error;
  }
  if (refundIf?.(result) === true) {
    await releaseCredits(actor.db, held.id);
    actor.log?.set({ credits: { refunded: step } });
    return result;
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
