import type { models } from "@polar-sh/sdk/2026-10";
import type { Database } from "@wovain/db";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { CustomerConflictError, ensureCustomer } from "../src/customer";
import type { CustomerGateway, CustomerMerchant } from "../src/customer";
import { addUser, createTestDb } from "../src/testing";

// Settling a merchant's Polar customer against a stand-in for Polar, on a
// real Postgres (PGlite): every branch of an email that Polar already holds.

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await close();
});

const merchant = (overrides: Partial<CustomerMerchant> = {}) => ({
  email: "merchant@example.com",
  emailVerified: true,
  id: "new-user",
  name: "Merchant",
  ...overrides,
});

const holder = (externalId: string | null) =>
  ({
    email: "merchant@example.com",
    external_id: externalId,
    id: "cus_holder",
  }) as unknown as models.Customer;

const gateway = (
  options: {
    created?: ("created" | "email_taken")[];
    holder?: models.Customer;
    own?: models.Customer;
  } = {}
) => {
  const created = [...(options.created ?? ["created"])];
  return {
    create: vi.fn(() => Promise.resolve(created.shift() ?? "created")),
    findByEmail: vi.fn(() => Promise.resolve(options.holder)),
    findByExternalId: vi.fn(() => Promise.resolve(options.own)),
    link: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  } satisfies CustomerGateway;
};

it("does nothing when the merchant already has a customer", async () => {
  const polar = gateway({ own: holder("new-user") });
  expect(await ensureCustomer(db, polar, merchant())).toBe("existing");
  expect(polar.create).not.toHaveBeenCalled();
});

it("creates a customer when the email is free", async () => {
  const polar = gateway();
  expect(await ensureCustomer(db, polar, merchant())).toBe("created");
  expect(polar.findByEmail).not.toHaveBeenCalled();
});

it("links a customer that holds the email without an external id", async () => {
  const polar = gateway({
    created: ["email_taken"],
    holder: holder(null),
  });
  expect(await ensureCustomer(db, polar, merchant())).toBe("linked");
  expect(polar.link).toHaveBeenCalledWith("cus_holder", "new-user");
  expect(polar.remove).not.toHaveBeenCalled();
});

it("replaces a customer linked to a user that no longer exists", async () => {
  const polar = gateway({
    created: ["email_taken", "created"],
    holder: holder("gone-user"),
  });
  expect(await ensureCustomer(db, polar, merchant())).toBe("replaced");
  expect(polar.remove).toHaveBeenCalledWith("cus_holder");
  expect(polar.create).toHaveBeenCalledTimes(2);
});

it("never touches a customer linked to a live user", async () => {
  await addUser(db, "other-user");
  const polar = gateway({
    created: ["email_taken"],
    holder: holder("other-user"),
  });
  const failure = await ensureCustomer(db, polar, merchant()).catch(
    (error: unknown) => error
  );
  expect(failure).toBeInstanceOf(CustomerConflictError);
  expect(failure).toMatchObject({ reason: "linked_to_other_account" });
  expect(polar.link).not.toHaveBeenCalled();
  expect(polar.remove).not.toHaveBeenCalled();
});

it("refuses to take over a customer while the email is unverified", async () => {
  const polar = gateway({
    created: ["email_taken"],
    holder: holder("gone-user"),
  });
  const failure = await ensureCustomer(
    db,
    polar,
    merchant({ emailVerified: false })
  ).catch((error: unknown) => error);
  expect(failure).toMatchObject({ reason: "email_not_verified" });
  expect(polar.link).not.toHaveBeenCalled();
  expect(polar.remove).not.toHaveBeenCalled();
});

it("treats a customer that is already the merchant's as existing", async () => {
  const polar = gateway({
    created: ["email_taken"],
    holder: holder("new-user"),
  });
  expect(await ensureCustomer(db, polar, merchant())).toBe("existing");
  expect(polar.remove).not.toHaveBeenCalled();
});

it("fails loudly when Polar says the email exists but lists no customer", async () => {
  const polar = gateway({ created: ["email_taken"] });
  await expect(ensureCustomer(db, polar, merchant())).rejects.toThrow(
    "lists no customer"
  );
});

it("fails loudly when the email is still taken after the stale customer was removed", async () => {
  const polar = gateway({
    created: ["email_taken", "email_taken"],
    holder: holder("gone-user"),
  });
  await expect(ensureCustomer(db, polar, merchant())).rejects.toThrow(
    "still has a customer"
  );
});
