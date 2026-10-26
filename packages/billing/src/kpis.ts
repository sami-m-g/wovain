import { usd } from "./analytics";
import type { BillingEvent } from "./analytics";
import { PLANS } from "./plans";
import type { PlanCode } from "./plans";

// Which revenue events a subscription change means, from the copy stored
// before a webhook and the one it brings. Only the first sign of each change
// counts, so a redelivered or repeated event sends nothing.

export interface SubscriptionState {
  cancelAtPeriodEnd: boolean;
  plan: PlanCode;
  status: string;
}

export interface SubscriptionUpdate extends SubscriptionState {
  amountCents: number;
  interval: string;
  reason: string | null;
  trial: boolean;
}

const ENTITLED = new Set(["active", "trialing"]);

const isPaid = (state: SubscriptionState | undefined) =>
  state !== undefined && ENTITLED.has(state.status) && state.plan !== "free";

export const subscriptionEvents = (
  prior: SubscriptionState | undefined,
  next: SubscriptionUpdate
) => {
  const events: { event: BillingEvent; properties: Record<string, unknown> }[] =
    [];
  if (isPaid(next) && !isPaid(prior)) {
    events.push({
      event: "subscription_started",
      properties: {
        amount_usd: usd(next.amountCents),
        interval: next.interval,
        plan: next.plan,
        trial: next.trial,
      },
    });
  } else if (isPaid(next) && prior !== undefined && prior.plan !== next.plan) {
    events.push({
      event: "subscription_changed",
      properties: {
        amount_usd_delta: usd(
          PLANS[next.plan].priceCents - PLANS[prior.plan].priceCents
        ),
        from_plan: prior.plan,
        to_plan: next.plan,
      },
    });
  }
  const scheduled = next.cancelAtPeriodEnd && prior?.cancelAtPeriodEnd !== true;
  const ended =
    !ENTITLED.has(next.status) &&
    prior?.cancelAtPeriodEnd !== true &&
    (prior === undefined || ENTITLED.has(prior.status));
  if (next.plan !== "free" && (scheduled || ended)) {
    events.push({
      event: "subscription_canceled",
      properties: {
        amount_usd: usd(next.amountCents),
        plan: next.plan,
        reason: next.reason ?? (scheduled ? "canceled" : next.status),
      },
    });
  }
  return events;
};
