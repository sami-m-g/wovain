import { createPolarCore, errors } from "@polar-sh/sdk/2026-10";
import type { Environment, PolarCore } from "@polar-sh/sdk/2026-10";
import { createCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { createCustomerSessions } from "@polar-sh/sdk/2026-10/services/customer_sessions";
import {
  createCustomers,
  getExternalCustomers,
  getStateExternalCustomers,
} from "@polar-sh/sdk/2026-10/services/customers";
import { ingestEvents } from "@polar-sh/sdk/2026-10/services/events";
import { iterListProducts } from "@polar-sh/sdk/2026-10/services/products";
import { createSubscriptions } from "@polar-sh/sdk/2026-10/services/subscriptions";

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

// Makes sure a merchant is a Polar customer on some plan: one with no
// subscription (new, or a paid plan just ended) is put on Free, whose
// benefit grants the monthly free credits. Users from before billing get
// their customer here too; new sign-ups get it from the Better Auth plugin.
export const ensureFreePlan = async (
  polar: PolarCore,
  merchant: { email: string; id: string; name: string }
) => {
  try {
    await getExternalCustomers(polar)(merchant.id);
  } catch (error) {
    if (!(error instanceof errors.ResourceNotFound)) {
      throw error;
    }
    await createCustomers(polar)({
      email: merchant.email,
      external_id: merchant.id,
      name: merchant.name,
    });
  }
  const state = await getStateExternalCustomers(polar)(merchant.id);
  if (state.active_subscriptions.length > 0) {
    return false;
  }
  await createSubscriptions(polar)({
    external_customer_id: merchant.id,
    product_id: await productId(polar, "free"),
  });
  return true;
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
