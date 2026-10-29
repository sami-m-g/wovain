import { setTimeout as sleep } from "node:timers/promises";

import { creditBalance } from "@wovain/billing/credits";
import { CustomerConflictError } from "@wovain/billing/customer";
import type { CustomerConflictReason } from "@wovain/billing/customer";
import { entitlement, merchantOf } from "@wovain/billing/mirror";
import { ensureFreePlan } from "@wovain/billing/polar";
import { log } from "evlog";

import type { Actor } from "./actor";

// Where a merchant's Free plan stands, for the Billing page:
// - "none": nothing to do (a plan is mirrored, or Polar is off);
// - "started": asked Polar for Free, whose webhooks bring the credits;
// - "retrying": Polar failed, and the next try waits (the failure is in error
//   tracking);
// - "blocked_*": the email's Polar customer isn't the merchant's to take over,
//   so retrying can't help until someone looks.
export type FreePlanState =
  | "blocked_email_not_verified"
  | "blocked_linked_to_other_account"
  | "none"
  | "retrying"
  | "started";

interface Attempt {
  failures: number;
  state: FreePlanState;
  until: number;
}

// Per server process. billing/status runs on every Billing page poll, so a
// settled outcome is remembered: a start for SUCCESS_TTL_MS (its webhooks are
// on their way), a failure with a wait that doubles up to MAX_BACKOFF_MS, a
// block for BLOCKED_TTL_MS.
const SUCCESS_TTL_MS = 60_000;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 300_000;
const BLOCKED_TTL_MS = 600_000;
const attempts = new Map<string, Attempt>();

export const resetFreePlanThrottle = () => {
  attempts.clear();
};

const blockedState = (reason: CustomerConflictReason): FreePlanState =>
  reason === "email_not_verified"
    ? "blocked_email_not_verified"
    : "blocked_linked_to_other_account";

const failureFields = (error: unknown) =>
  error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { message: String(error), name: "Error" };

// A merchant with no plan mirrored yet (an account from before billing, or a
// sign-up whose webhooks are still on their way) is put on Free in Polar. Its
// webhooks then grant the monthly free credits.
export const startFreePlan = async (
  actor: Actor,
  now = Date.now()
): Promise<FreePlanState> => {
  const { polar } = actor.billing;
  if (polar === undefined) {
    return "none";
  }
  const previous = attempts.get(actor.userId);
  if (previous !== undefined && now < previous.until) {
    return previous.state;
  }
  const current = await entitlement(actor.db, actor.userId);
  const merchant = await merchantOf(actor.db, actor.userId);
  if (current.subscription !== null || merchant === undefined) {
    return "none";
  }
  try {
    await ensureFreePlan(polar, actor.db, merchant);
    attempts.set(actor.userId, {
      failures: 0,
      state: "started",
      until: now + SUCCESS_TTL_MS,
    });
    return "started";
  } catch (error) {
    const blocked = error instanceof CustomerConflictError;
    const failures = (previous?.failures ?? 0) + 1;
    const state = blocked ? blockedState(error.reason) : "retrying";
    attempts.set(actor.userId, {
      failures,
      state,
      until:
        now +
        (blocked
          ? BLOCKED_TTL_MS
          : Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS)),
    });
    // Every failure reaches error tracking, once per try (not per poll).
    log.error({
      billing: { failures, freePlan: state },
      error: {
        ...failureFields(error),
        code: blocked ? "POLAR_CUSTOMER_CONFLICT" : "POLAR_FREE_PLAN_FAILED",
      },
      userId: actor.userId,
    });
    return state;
  }
};

const POLL_MS = 500;
const WAIT_MS = 8000;

// On a merchant's first paid step, waits briefly for the free credits that
// startFreePlan's webhooks bring. Returns the balance it ends with.
export const awaitFreeCredits = async (actor: Actor, needed: number) => {
  let { available } = await creditBalance(actor.db, actor.userId);
  if (available >= needed || (await startFreePlan(actor)) !== "started") {
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
