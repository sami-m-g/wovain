import type { Database } from "@wovain/db";
import { afterEach, beforeEach, expect, it } from "vitest";

import { creditBalance } from "../src/credits";
import {
  applyGrant,
  entitlement,
  revokeGrant,
  upsertSubscription,
} from "../src/mirror";
import type { GrantCredits, SubscriptionCopy } from "../src/mirror";
import { addUser, createTestDb, ledgerTotals } from "../src/testing";

let db: Database;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ close, db } = await createTestDb());
  userId = await addUser(db, "merchant");
});

afterEach(async () => {
  await close();
});

const plan = (overrides: Partial<GrantCredits> = {}): GrantCredits => ({
  grantId: "grant_studio",
  periodKey: "2026-10-01T00:00:00Z",
  rollover: false,
  source: "plan",
  units: 300,
  userId,
  ...overrides,
});

it("applies a redelivered grant once", async () => {
  expect(await applyGrant(db, plan())).toBe(true);
  expect(await applyGrant(db, plan())).toBe(false);
  expect(await creditBalance(db, userId)).toMatchObject({ plan: 300 });
});

it("resets a plan's credits each period and logs what expired", async () => {
  await applyGrant(db, plan({ units: 15 }));
  await applyGrant(db, plan({ periodKey: "2026-11-01T00:00:00Z", units: 15 }));
  expect(await creditBalance(db, userId)).toMatchObject({ plan: 15 });
  const totals = await ledgerTotals(db, userId);
  expect(totals).toStrictEqual({ grants: 15, ledger: 15 });
});

it("rolls unused credits over when the plan does", async () => {
  await applyGrant(db, plan({ rollover: true, units: 1000 }));
  await applyGrant(
    db,
    plan({ periodKey: "2026-11-01T00:00:00Z", rollover: true, units: 1000 })
  );
  expect(await creditBalance(db, userId)).toMatchObject({ plan: 2000 });
});

it("ignores a late event for an older period", async () => {
  await applyGrant(db, plan({ periodKey: "2026-11-01T00:00:00Z", units: 300 }));
  expect(await applyGrant(db, plan({ units: 999 }))).toBe(false);
  expect(await creditBalance(db, userId)).toMatchObject({ plan: 300 });
});

it("keeps a grant revoked even when its creation arrives later", async () => {
  await revokeGrant(db, plan());
  expect(await applyGrant(db, plan())).toBe(false);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 0 });
  const totals = await ledgerTotals(db, userId);
  expect(totals.ledger).toBe(totals.grants);
});

const subscription = (
  overrides: Partial<SubscriptionCopy> = {}
): SubscriptionCopy => ({
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date("2026-11-26T00:00:00Z"),
  id: "sub_free",
  modifiedAt: new Date("2026-10-26T10:00:00Z"),
  plan: "free",
  productId: "prod_free",
  status: "active",
  userId,
  ...overrides,
});

it("is on Free with no subscription", async () => {
  expect(await entitlement(db, userId)).toStrictEqual({
    plan: "free",
    subscription: null,
  });
});

it("picks the best active plan and keeps the newest copy", async () => {
  await upsertSubscription(db, subscription());
  await upsertSubscription(
    db,
    subscription({ id: "sub_studio", plan: "studio", productId: "prod_studio" })
  );
  expect(await entitlement(db, userId)).toMatchObject({ plan: "studio" });
  // An older event arriving late doesn't undo the newer state.
  await upsertSubscription(
    db,
    subscription({
      id: "sub_studio",
      modifiedAt: new Date("2026-10-26T11:00:00Z"),
      plan: "studio",
      status: "revoked",
    })
  );
  expect(
    await upsertSubscription(
      db,
      subscription({ id: "sub_studio", plan: "studio", status: "active" })
    )
  ).toBe(false);
  expect(await entitlement(db, userId)).toMatchObject({
    plan: "free",
    subscription: { id: "sub_free", status: "active" },
  });
});
