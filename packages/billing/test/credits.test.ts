import type { Database } from "@wovain/db";
import { creditReservation } from "@wovain/db/schema/billing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import {
  creditBalance,
  releaseCredits,
  reserveCredits,
  settleCredits,
} from "../src/credits";
import { applyGrant, revokeGrant } from "../src/mirror";
import { CREDIT_COST } from "../src/plans";
import { addUser, createTestDb, ledgerTotals } from "../src/testing";

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;
let userId: string;

const grantPlan = async (units: number, periodKey = "2026-10-01T00:00:00Z") =>
  await applyGrant(db, {
    grantId: "grant_plan",
    periodKey,
    rollover: false,
    source: "plan",
    units,
    userId,
  });

const grantPack = async (units: number) =>
  await applyGrant(db, {
    grantId: "grant_pack",
    periodKey: "2026-10-02T00:00:00Z",
    rollover: true,
    source: "pack",
    units,
    userId,
  });

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
  userId = await addUser(db, "merchant");
});

afterAll(async () => {
  await close();
});

it("has no credits until Polar grants some", async () => {
  expect(await creditBalance(db, userId)).toStrictEqual({
    available: 0,
    pack: 0,
    plan: 0,
  });
  const held = await reserveCredits(db, { step: "research", userId });
  expect(held).toStrictEqual({
    available: 0,
    needed: CREDIT_COST.research,
    ok: false,
  });
});

it("reserves a step's credits and settles them once", async () => {
  await grantPlan(15);
  const held = await reserveCredits(db, { step: "research", userId });
  expect(held.ok).toBe(true);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 12 });
  if (!held.ok) {
    return;
  }
  expect(await settleCredits(db, held.id)).toMatchObject({
    credits: CREDIT_COST.research,
    step: "research",
    userId,
  });
  expect(await settleCredits(db, held.id)).toBeUndefined();
  expect(await releaseCredits(db, held.id)).toBe(0);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 12 });
  const totals = await ledgerTotals(db, userId);
  expect(totals.ledger).toBe(totals.grants);
});

it("gives a failed step's credits back, once", async () => {
  await grantPlan(15);
  const held = await reserveCredits(db, { step: "design", userId });
  if (!held.ok) {
    throw new Error("expected a reservation");
  }
  expect(await releaseCredits(db, held.id)).toBe(CREDIT_COST.design);
  expect(await releaseCredits(db, held.id)).toBe(0);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 15 });
  const [row] = await db
    .select({ status: creditReservation.status })
    .from(creditReservation)
    .where(eq(creditReservation.id, held.id));
  expect(row?.status).toBe("released");
  const totals = await ledgerTotals(db, userId);
  expect(totals.ledger).toBe(totals.grants);
});

it("never overspends under concurrent steps", async () => {
  await grantPlan(15);
  const attempts = await Promise.all(
    Array.from(
      { length: 20 },
      async () => await reserveCredits(db, { step: "design", userId })
    )
  );
  // 15 credits buy seven 2-credit designs, with 1 credit left over.
  expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(7);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 1 });
  const totals = await ledgerTotals(db, userId);
  expect(totals).toStrictEqual({ grants: 1, ledger: 1 });
});

it("spends plan credits before pack credits and splits across them", async () => {
  await grantPlan(2);
  await grantPack(100);
  const held = await reserveCredits(db, { step: "research", userId });
  expect(held.ok).toBe(true);
  expect(await creditBalance(db, userId)).toStrictEqual({
    available: 99,
    pack: 99,
    plan: 0,
  });
});

it("doesn't give back credits from a period that has since reset", async () => {
  await grantPlan(15);
  const held = await reserveCredits(db, { step: "research", userId });
  if (!held.ok) {
    throw new Error("expected a reservation");
  }
  // The month turns while the step runs: the plan resets to 15.
  await grantPlan(15, "2026-11-01T00:00:00Z");
  expect(await releaseCredits(db, held.id)).toBe(0);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 15 });
  const totals = await ledgerTotals(db, userId);
  expect(totals.ledger).toBe(totals.grants);
});

it("doesn't give back credits to a revoked grant", async () => {
  await grantPlan(15);
  const held = await reserveCredits(db, { step: "assist", userId });
  if (!held.ok) {
    throw new Error("expected a reservation");
  }
  await revokeGrant(db, {
    grantId: "grant_plan",
    rollover: false,
    source: "plan",
    userId,
  });
  expect(await releaseCredits(db, held.id)).toBe(0);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 0 });
});
