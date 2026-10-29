import { errors } from "@polar-sh/sdk/2026-10";
import type { PolarCore, models } from "@polar-sh/sdk/2026-10";
import {
  createCustomers,
  deleteCustomers,
  getExternalCustomers,
  iterListCustomers,
  updateCustomers,
} from "@polar-sh/sdk/2026-10/services/customers";
import type { Database } from "@wovain/db";

import { merchantOf } from "./mirror";

// A merchant's customer in Polar. Polar allows one customer per email and
// never changes an `external_id` once set, so a user whose email is already a
// customer under another id (an account recreated, a database rebuilt) can't
// get a customer by the plain create: it fails with 422 and the merchant is
// left with no plan and no credits, and any grant lands on the old id and is
// skipped. This settles that case, and only that case: a customer that
// belongs to no live user in our database is replaced; one that belongs to a
// live user is never touched.

export interface CustomerMerchant {
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
}

export type CustomerOutcome = "created" | "existing" | "linked" | "replaced";

export type CustomerConflictReason =
  | "email_not_verified"
  | "linked_to_other_account";

// Why a merchant can't be given a Polar customer; the UI words each reason.
export class CustomerConflictError extends Error {
  reason: CustomerConflictReason;

  constructor(reason: CustomerConflictReason, merchantId: string) {
    super(
      reason === "email_not_verified"
        ? `Polar already has a customer with the email of user ${merchantId}, and the email is not verified`
        : `Polar already has a customer with the email of user ${merchantId}, linked to another live account`
    );
    this.name = "CustomerConflictError";
    this.reason = reason;
  }
}

// The Polar calls a settlement makes, so tests can stand in for Polar.
export interface CustomerGateway {
  create: (merchant: CustomerMerchant) => Promise<"created" | "email_taken">;
  findByEmail: (email: string) => Promise<models.Customer | undefined>;
  findByExternalId: (id: string) => Promise<models.Customer | undefined>;
  // Sets the external id of a customer that has none yet.
  link: (customerId: string, externalId: string) => Promise<void>;
  remove: (customerId: string) => Promise<void>;
}

const isEmailTaken = (error: unknown) =>
  error instanceof Error &&
  /already exists/iu.test(error.message) &&
  /email/iu.test(error.message);

export const polarCustomerGateway = (polar: PolarCore): CustomerGateway => ({
  create: async (merchant) => {
    try {
      await createCustomers(polar)({
        email: merchant.email,
        external_id: merchant.id,
        name: merchant.name,
      });
      return "created";
    } catch (error) {
      if (isEmailTaken(error)) {
        return "email_taken";
      }
      throw error;
    }
  },
  findByEmail: async (email) => {
    const wanted = email.toLowerCase();
    for await (const customer of iterListCustomers(polar)({ email })) {
      if (customer.email?.toLowerCase() === wanted) {
        return customer;
      }
    }
  },
  findByExternalId: async (id) => {
    try {
      return await getExternalCustomers(polar)(id);
    } catch (error) {
      if (error instanceof errors.ResourceNotFound) {
        return;
      }
      throw error;
    }
  },
  link: async (customerId, externalId) => {
    await updateCustomers(polar)(customerId, { external_id: externalId });
  },
  remove: async (customerId) => {
    await deleteCustomers(polar)(customerId);
  },
});

export const ensureCustomer = async (
  db: Database,
  gateway: CustomerGateway,
  merchant: CustomerMerchant
): Promise<CustomerOutcome> => {
  if ((await gateway.findByExternalId(merchant.id)) !== undefined) {
    return "existing";
  }
  if ((await gateway.create(merchant)) === "created") {
    return "created";
  }
  const holder = await gateway.findByEmail(merchant.email);
  if (holder === undefined) {
    throw new Error(
      `Polar refused a customer for user ${merchant.id} because the email exists, but lists no customer with it`
    );
  }
  const holderId = holder.external_id ?? undefined;
  if (holderId === merchant.id) {
    return "existing";
  }
  // An unverified email proves nothing about who owns the customer.
  if (!merchant.emailVerified) {
    throw new CustomerConflictError("email_not_verified", merchant.id);
  }
  if (holderId === undefined) {
    await gateway.link(holder.id, merchant.id);
    return "linked";
  }
  if ((await merchantOf(db, holderId)) !== undefined) {
    throw new CustomerConflictError("linked_to_other_account", merchant.id);
  }
  // A stale link: its user is gone, so nobody can use that customer's plan
  // or credits. Polar can't re-point its external id, so it is replaced.
  await gateway.remove(holder.id);
  if ((await gateway.create(merchant)) !== "created") {
    throw new Error(
      `Polar still has a customer with the email of user ${merchant.id} after the stale one was removed`
    );
  }
  return "replaced";
};
