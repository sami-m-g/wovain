import { setTimeout as sleep } from "node:timers/promises";

import { creditBalance } from "@wovain/billing/credits";
import { entitlement, merchantOf } from "@wovain/billing/mirror";
import { ensureFreePlan } from "@wovain/billing/polar";

import type { Actor } from "./actor";

// A merchant with no plan mirrored yet (an account from before billing, or a
// sign-up whose webhooks are still on their way) is put on Free in Polar. Its
// webhooks then grant the monthly free credits. Returns whether it asked.
export const startFreePlan = async (actor: Actor) => {
  const { polar } = actor.billing;
  if (polar === undefined) {
    return false;
  }
  const current = await entitlement(actor.db, actor.userId);
  const merchant = await merchantOf(actor.db, actor.userId);
  if (current.subscription !== null || merchant === undefined) {
    return false;
  }
  try {
    await ensureFreePlan(polar, merchant);
    return true;
  } catch (error) {
    actor.log?.set({
      polar: {
        freePlanFailed: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
};

const POLL_MS = 500;
const WAIT_MS = 8000;

// On a merchant's first paid step, waits briefly for the free credits that
// startFreePlan's webhooks bring. Returns the balance it ends with.
export const awaitFreeCredits = async (actor: Actor, needed: number) => {
  let { available } = await creditBalance(actor.db, actor.userId);
  if (available >= needed || !(await startFreePlan(actor))) {
    return available;
  }
  for (
    let waited = 0;
    waited < WAIT_MS && available < needed;
    waited += POLL_MS
  ) {
    // oxlint-disable-next-line no-await-in-loop
    await sleep(POLL_MS);
    // oxlint-disable-next-line no-await-in-loop
    ({ available } = await creditBalance(actor.db, actor.userId));
  }
  return available;
};
