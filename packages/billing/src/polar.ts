import { createPolarCore } from "@polar-sh/sdk/2026-10";
import type { Environment, PolarCore } from "@polar-sh/sdk/2026-10";
import { createCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { createCustomerSessions } from "@polar-sh/sdk/2026-10/services/customer_sessions";
import { getStateExternalCustomers } from "@polar-sh/sdk/2026-10/services/customers";
import { ingestEvents } from "@polar-sh/sdk/2026-10/services/events";
import { iterListProducts } from "@polar-sh/sdk/2026-10/services/products";
import {
  createSubscriptions,
  revokeSubscriptions,
} from "@polar-sh/sdk/2026-10/services/subscriptions";
import type { Database } from "@wovain/db";
import { sql } from "drizzle-orm";
import { log } from "evlog";

import { ensureCustomer, polarCustomerGateway } from "./customer";
import type { CustomerGateway, CustomerMerchant } from "./customer";
import { CREDIT_METER, POLAR_METADATA_KEY } from "./plans";
import type { CreditStep, Offer, PlanCode } from "./plans";

// The Polar calls wovain makes itself (checkout, portal, the free plan and
// usage events), on one core client per process. The Better Auth plugin
// (packages/auth) makes the others: the customer at sign-up and the webhook
// endpoint.

export interface PolarConfig {
  POLAR_ACCESS_TOKEN?: string | undefined;
  POLAR_ENVIRONMENT: Environment;
}

export const createPolarClient = (env: PolarConfig): PolarCore | undefined =>
  env.POLAR_ACCESS_TOKEN === undefined || env.POLAR_ACCESS_TOKEN === ""
    ? undefined
    : createPolarCore({
        accessToken: env.POLAR_ACCESS_TOKEN,
        environment: env.POLAR_ENVIRONMENT,
      });

type CatalogCode = PlanCode | "pack";

// Product IDs by catalog code, read from the products the seed tagged
// (`wovain` metadata) and kept for the process; a code not found yet is
// looked up again on the next call.
const catalogs = new WeakMap<PolarCore, Map<string, string>>();

const readCatalog = async (polar: PolarCore) => {
  const ids = new Map<string, string>();
  for await (const product of iterListProducts(polar)({ is_archived: false })) {
    const code = product.metadata[POLAR_METADATA_KEY];
    if (typeof code === "string" && !ids.has(code)) {
      ids.set(code, product.id);
    }
  }
  catalogs.set(polar, ids);
  return ids;
};

export const productId = async (polar: PolarCore, code: CatalogCode) => {
  const cached = catalogs.get(polar)?.get(code);
  if (cached !== undefined) {
    return cached;
  }
  const catalog = await readCatalog(polar);
  const id = catalog.get(code);
  if (id === undefined) {
    throw new Error(
      `Polar has no product tagged ${POLAR_METADATA_KEY}=${code}; run pnpm polar:seed`
    );
  }
  return id;
};

export interface CheckoutInput {
  // The merchant's free subscription, which a plan checkout upgrades in
  // place (Polar allows one subscription per customer).
  freeSubscriptionId?: string | undefined;
  offer: Offer;
  returnUrl: string;
  successUrl: string;
  userId: string;
}

export const checkoutUrl = async (polar: PolarCore, input: CheckoutInput) => {
  const isPlan = input.offer !== "pack";
  const checkout = await createCheckouts(polar)({
    external_customer_id: input.userId,
    products: [await productId(polar, input.offer)],
    return_url: input.returnUrl,
    success_url: input.successUrl,
    ...(isPlan && input.freeSubscriptionId !== undefined
      ? { subscription_id: input.freeSubscriptionId }
      : {}),
  });
  return checkout.url;
};

export const portalUrl = async (
  polar: PolarCore,
  { returnUrl, userId }: { returnUrl: string; userId: string }
) => {
  const session = await createCustomerSessions(polar)({
    external_customer_id: userId,
    return_url: returnUrl,
  });
  return session.customer_portal_url;
};

// The Polar calls ensureFreePlan makes on a merchant's subscriptions, so
// tests can stand in for Polar.
export interface FreePlanGateway {
  // Active subscriptions of the merchant's customer, oldest first.
  activeSubscriptions: (
    merchantId: string
  ) => Promise<{ id: string; productId: string }[]>;
  create: (merchantId: string, productId: string) => Promise<void>;
  freeProductId: () => Promise<string>;
  revoke: (subscriptionId: string) => Promise<void>;
}

export const polarFreePlanGateway = (polar: PolarCore): FreePlanGateway => ({
  activeSubscriptions: async (merchantId) => {
    const state = await getStateExternalCustomers(polar)(merchantId);
    return state.active_subscriptions
      .toSorted((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((subscription) => ({
        id: subscription.id,
        productId: subscription.product_id,
      }));
  },
  create: async (merchantId, product) => {
    await createSubscriptions(polar)({
      external_customer_id: merchantId,
      product_id: product,
    });
  },
  freeProductId: async () => await productId(polar, "free"),
  revoke: async (subscriptionId) => {
    await revokeSubscriptions(polar)(subscriptionId);
  },
});

// Makes sure a merchant is a Polar customer on some plan: one with no
// subscription (new, or a paid plan just ended) is put on Free, whose
// benefit grants the monthly free credits. Users from before billing get
// their customer here too; new sign-ups get it from the Better Auth plugin.
// A customer that exists under a stale link is settled by ensureCustomer,
// which throws CustomerConflictError when the email belongs to a live
// account.
//
// The sign-up webhook and the Billing page's poll both land here at once, and
// Polar lets a customer hold two Free subscriptions (each grants the monthly
// credits). So the check and the create run under a per-merchant database
// lock, shared by every server instance, and a second Free subscription that
// got through anyway is revoked (its grant's revoke webhook takes its credits
// back) and reported to error tracking.
export const ensureFreePlan = async (
  polar: PolarCore,
  db: Database,
  merchant: CustomerMerchant,
  gateways: {
    customer?: CustomerGateway;
    freePlan?: FreePlanGateway;
  } = {}
) => {
  await ensureCustomer(
    db,
    gateways.customer ?? polarCustomerGateway(polar),
    merchant
  );
  const plans = gateways.freePlan ?? polarFreePlanGateway(polar);
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`free-plan:${merchant.id}`}))`
    );
    const active = await plans.activeSubscriptions(merchant.id);
    if (active.length === 0) {
      await plans.create(merchant.id, await plans.freeProductId());
      return true;
    }
    const free = await plans.freeProductId();
    const [, ...extras] = active.filter(
      (subscription) => subscription.productId === free
    );
    for (const extra of extras) {
      // oxlint-disable-next-line no-await-in-loop
      await plans.revoke(extra.id);
      log.error({
        billing: { subscriptionId: extra.id, userId: merchant.id },
        error: {
          code: "POLAR_DUPLICATE_FREE_SUBSCRIPTION",
          message: "A second Free subscription was revoked",
          name: "PolarDuplicateFreeSubscription",
        },
      });
    }
    return false;
  });
};

// Reports a settled step to Polar's credits meter, so the customer portal
// shows usage against the same grants. `external_id` makes a retry count once.
export const reportUsage = async (
  polar: PolarCore,
  usage: {
    credits: number;
    reservationId: string;
    step: CreditStep;
    userId: string;
  }
) => {
  await ingestEvents(polar)({
    events: [
      {
        external_customer_id: usage.userId,
        external_id: usage.reservationId,
        metadata: {
          [CREDIT_METER.property]: usage.credits,
          step: usage.step,
        },
        name: CREDIT_METER.event,
      },
    ],
  });
};
