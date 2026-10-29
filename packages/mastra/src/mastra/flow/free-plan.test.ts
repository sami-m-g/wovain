import { CustomerConflictError } from "@wovain/billing/customer";
import { ensureFreePlan } from "@wovain/billing/polar";
import { addUser, createTestDb } from "@wovain/billing/testing";
import type { Database } from "@wovain/db";
import { log } from "evlog";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { resetFreePlanThrottle, startFreePlan } from "./free-plan";

vi.mock(import("@wovain/billing/polar"), async (importOriginal) => ({
  ...(await importOriginal()),
  ensureFreePlan: vi.fn(),
}));

// The Free plan start: what the Billing page shows, how often Polar is
// asked, and that every failure reaches error tracking.

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;
const ensure = vi.mocked(ensureFreePlan);

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
  await addUser(db, "merchant");
  resetFreePlanThrottle();
  ensure.mockReset();
  vi.spyOn(log, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await close();
});

const actor = (polar = true) =>
  ({
    billing: { polar: polar ? {} : undefined },
    db,
    userId: "merchant",
  }) as unknown as Actor;

it("does nothing without Polar", async () => {
  expect(await startFreePlan(actor(false))).toBe("none");
  expect(ensure).not.toHaveBeenCalled();
});

it("starts Free once, then remembers it for a minute", async () => {
  ensure.mockResolvedValue(true);
  const now = 1_000_000;
  expect(await startFreePlan(actor(), now)).toBe("started");
  expect(await startFreePlan(actor(), now + 59_000)).toBe("started");
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(await startFreePlan(actor(), now + 61_000)).toBe("started");
  expect(ensure).toHaveBeenCalledTimes(2);
});

it("backs off after a failure, reports it at error level, and recovers", async () => {
  ensure.mockRejectedValueOnce(new Error("Polar 500"));
  const now = 1_000_000;
  expect(await startFreePlan(actor(), now)).toBe("retrying");
  expect(log.error).toHaveBeenCalledTimes(1);
  expect(log.error).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({
        code: "POLAR_FREE_PLAN_FAILED",
        message: "Polar 500",
      }),
    })
  );
  // Polls inside the wait neither call Polar nor log again.
  expect(await startFreePlan(actor(), now + 4000)).toBe("retrying");
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(log.error).toHaveBeenCalledTimes(1);
  ensure.mockResolvedValueOnce(true);
  expect(await startFreePlan(actor(), now + 5001)).toBe("started");
});

it("doubles the wait on each failure up to a cap", async () => {
  ensure.mockRejectedValue(new Error("Polar 500"));
  let now = 1_000_000;
  await startFreePlan(actor(), now);
  now += 5001;
  await startFreePlan(actor(), now);
  // The second wait is 10 seconds.
  expect(await startFreePlan(actor(), now + 9000)).toBe("retrying");
  expect(ensure).toHaveBeenCalledTimes(2);
  await startFreePlan(actor(), now + 10_001);
  expect(ensure).toHaveBeenCalledTimes(3);
});

it("shows a block, and logs it at error level, when the email is another account's", async () => {
  ensure.mockRejectedValue(
    new CustomerConflictError("linked_to_other_account", "merchant")
  );
  expect(await startFreePlan(actor(), 1_000_000)).toBe(
    "blocked_linked_to_other_account"
  );
  expect(log.error).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({ code: "POLAR_CUSTOMER_CONFLICT" }),
    })
  );
  // Retrying can't help, so the next poll doesn't call Polar.
  await startFreePlan(actor(), 1_000_000 + 30_000);
  expect(ensure).toHaveBeenCalledTimes(1);
});

it("shows an unverified email as its own block", async () => {
  ensure.mockRejectedValue(
    new CustomerConflictError("email_not_verified", "merchant")
  );
  expect(await startFreePlan(actor(), 1_000_000)).toBe(
    "blocked_email_not_verified"
  );
});
