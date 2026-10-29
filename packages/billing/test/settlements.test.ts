import type { Database } from "@wovain/db";
import { log } from "evlog";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { creditBalance } from "../src/credits";
import { applySettlements, settlementGrantId } from "../src/settlements";
import type { Settlement } from "../src/settlements";
import { addUser, createTestDb, ledgerTotals } from "../src/testing";

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  vi.spyOn(log, "info").mockImplementation(() => {});
  await reset();
  await addUser(db, "merchant");
});

afterAll(async () => {
  await close();
});

const settlement: Settlement = {
  environment: "next",
  id: "order-1",
  polarOrderId: "order-1",
  promoId: "judges-2026",
  reason: "lost redemption",
  source: "pack",
  units: 300,
  userId: "merchant",
};

it("credits a settlement of this environment once, however often it runs", async () => {
  expect(await applySettlements(db, "next", [settlement])).toStrictEqual([
    "order-1",
  ]);
  expect(await applySettlements(db, "next", [settlement])).toStrictEqual([]);
  const { available } = await creditBalance(db, "merchant");
  expect(available).toBe(300);
  expect(await ledgerTotals(db, "merchant")).toStrictEqual({
    grants: 300,
    ledger: 300,
  });
  expect(log.info).toHaveBeenCalledWith(
    expect.objectContaining({
      billing: expect.objectContaining({
        polarOrderId: "order-1",
        settlement: "order-1",
      }),
    })
  );
});

it("leaves another environment's settlement alone", async () => {
  expect(await applySettlements(db, "production", [settlement])).toStrictEqual(
    []
  );
  const { available } = await creditBalance(db, "merchant");
  expect(available).toBe(0);
});

it("keys the grant by the settlement id", () => {
  expect(settlementGrantId(settlement)).toBe("settle:order-1");
});
