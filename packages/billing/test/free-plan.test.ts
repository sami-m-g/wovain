import { setTimeout as sleep } from "node:timers/promises";

import type { PolarCore, models } from "@polar-sh/sdk/2026-10";
import type { Database } from "@wovain/db";
import { log } from "evlog";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import type { CustomerGateway } from "../src/customer";
import { ensureFreePlan } from "../src/polar";
import type { FreePlanGateway } from "../src/polar";
import { addUser, createTestDb } from "../src/testing";

// ensureFreePlan against a stand-in for Polar, on a real Postgres (PGlite):
// the sign-up webhook and the Billing poll arriving together must leave one
// Free subscription.

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  vi.spyOn(log, "error").mockImplementation(() => {});
  await reset();
});

afterAll(async () => {
  await close();
});

const FREE = "prod_free";
const merchant = {
  email: "m@example.com",
  emailVerified: true,
  id: "u1",
  name: "M",
};

// A customer that already exists and is linked, so only the plan is tested.
const customer: CustomerGateway = {
  create: () => Promise.resolve("created"),
  findByEmail: () => Promise.resolve(undefined as models.Customer | undefined),
  findByExternalId: () => Promise.resolve({ id: "cus" } as models.Customer),
  link: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

// Polar as it behaves: a create takes a moment, and a check made meanwhile
// sees nothing yet.
const fakePolar = (initial: { id: string; productId: string }[] = []) => {
  const subscriptions = [...initial];
  const revoked: string[] = [];
  let next = 0;
  const gateway: FreePlanGateway = {
    activeSubscriptions: () => Promise.resolve([...subscriptions]),
    create: async (_merchantId, productId) => {
      await sleep(20);
      next += 1;
      subscriptions.push({ id: `sub_${next}`, productId });
    },
    freeProductId: () => Promise.resolve(FREE),
    revoke: (id) => {
      revoked.push(id);
      const at = subscriptions.findIndex((item) => item.id === id);
      subscriptions.splice(at, 1);
      return Promise.resolve();
    },
  };
  return { gateway, revoked, subscriptions };
};

const run = (gateway: FreePlanGateway) =>
  ensureFreePlan({} as PolarCore, db, merchant, {
    customer,
    freePlan: gateway,
  });

it("creates Free once for a webhook and a poll at the same time", async () => {
  await addUser(db, "u1");
  const polar = fakePolar();
  const results = await Promise.all([run(polar.gateway), run(polar.gateway)]);
  expect(results.toSorted()).toStrictEqual([false, true]);
  expect(polar.subscriptions).toHaveLength(1);
});

it("does nothing for a merchant already on a plan", async () => {
  await addUser(db, "u1");
  const polar = fakePolar([{ id: "sub_paid", productId: "prod_studio" }]);
  expect(await run(polar.gateway)).toBe(false);
  expect(polar.subscriptions).toHaveLength(1);
  expect(polar.revoked).toStrictEqual([]);
});

it("revokes a second Free subscription and keeps the oldest", async () => {
  await addUser(db, "u1");
  const polar = fakePolar([
    { id: "sub_old", productId: FREE },
    { id: "sub_dup", productId: FREE },
  ]);
  expect(await run(polar.gateway)).toBe(false);
  expect(polar.revoked).toStrictEqual(["sub_dup"]);
  expect(log.error).toHaveBeenCalledTimes(1);
  expect(polar.subscriptions.map((item) => item.id)).toStrictEqual(["sub_old"]);
});
