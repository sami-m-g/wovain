import { expect, it } from "vitest";

import { subscriptionEvents } from "../src/kpis";
import type { SubscriptionUpdate } from "../src/kpis";

const update = (
  overrides: Partial<SubscriptionUpdate> = {}
): SubscriptionUpdate => ({
  amountCents: 2900,
  cancelAtPeriodEnd: false,
  interval: "month",
  plan: "studio",
  reason: null,
  status: "active",
  trial: false,
  ...overrides,
});

const names = (events: ReturnType<typeof subscriptionEvents>) =>
  events.map(({ event }) => event);

it("starts a paid plan when Free is upgraded in place", () => {
  const events = subscriptionEvents(
    { cancelAtPeriodEnd: false, plan: "free", status: "active" },
    update()
  );
  expect(events).toStrictEqual([
    {
      event: "subscription_started",
      properties: {
        amount_usd: 29,
        interval: "month",
        plan: "studio",
        trial: false,
      },
    },
  ]);
});

it("sends nothing for a repeated event or for Free itself", () => {
  const active = {
    cancelAtPeriodEnd: false,
    plan: "studio",
    status: "active",
  } as const;
  expect(subscriptionEvents(active, update())).toStrictEqual([]);
  expect(
    subscriptionEvents(undefined, update({ amountCents: 0, plan: "free" }))
  ).toStrictEqual([]);
});

it("reports a plan change with the price difference", () => {
  const events = subscriptionEvents(
    { cancelAtPeriodEnd: false, plan: "studio", status: "active" },
    update({ amountCents: 7900, plan: "label" })
  );
  expect(events).toStrictEqual([
    {
      event: "subscription_changed",
      properties: {
        amount_usd_delta: 50,
        from_plan: "studio",
        to_plan: "label",
      },
    },
  ]);
});

it("reports a cancellation once: when scheduled, not again when it ends", () => {
  const prior = {
    cancelAtPeriodEnd: false,
    plan: "studio",
    status: "active",
  } as const;
  const scheduled = subscriptionEvents(
    prior,
    update({ cancelAtPeriodEnd: true, reason: "too_expensive" })
  );
  expect(names(scheduled)).toStrictEqual(["subscription_canceled"]);
  expect(scheduled[0]?.properties).toMatchObject({ reason: "too_expensive" });
  expect(
    subscriptionEvents(
      { ...prior, cancelAtPeriodEnd: true },
      update({ cancelAtPeriodEnd: true, status: "revoked" })
    )
  ).toStrictEqual([]);
});

it("reports a plan revoked without notice as canceled", () => {
  const events = subscriptionEvents(
    { cancelAtPeriodEnd: false, plan: "label", status: "active" },
    update({ amountCents: 7900, plan: "label", status: "revoked" })
  );
  expect(events).toStrictEqual([
    {
      event: "subscription_canceled",
      properties: { amount_usd: 79, plan: "label", reason: "revoked" },
    },
  ]);
});
