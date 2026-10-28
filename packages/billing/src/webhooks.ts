import type { PolarCore, models, webhooks } from "@polar-sh/sdk/2026-10";
import type { Database } from "@wovain/db";

import { usd } from "./analytics";
import type { BillingAnalytics } from "./analytics";
import { billingCatalog } from "./catalog";
import { subscriptionEvents } from "./kpis";
import {
  applyGrant,
  entitlement,
  merchantOf,
  promoRedeemed,
  revokeGrant,
  storedSubscription,
  upsertSubscription,
} from "./mirror";
import { CREDIT_PACK_CODE, POLAR_METADATA_KEY, isPlanCode } from "./plans";
import { ensureFreePlan } from "./polar";
import { promoAllows, promoOfTag } from "./promos";
import { redeemSurface } from "./redeem";

// Polar's webhooks, as the Better Auth plugin hands them over after checking
// their signature (packages/auth). Every handler is idempotent: Polar retries
// a failed delivery and may deliver events out of order. A thrown error
// answers 500, so Polar tries again.

type Payload = webhooks.WebhookPayload;
type Grant = models.BenefitGrantWebhook;
type MeterCreditGrant = models.BenefitGrantMeterCreditWebhook;

export interface WebhookDeps {
  analytics?: BillingAnalytics | undefined;
  db: Database;
  log?: { set: (fields: Record<string, unknown>) => void } | undefined;
  polar: PolarCore;
}

const isMeterCredit = (grant: Grant): grant is MeterCreditGrant =>
  grant.benefit.type === "meter_credit";

// The wovain grant behind a Polar benefit grant, if it is one: a plan's
// credits, a pack's or a promo code's, from the benefit's `wovain` metadata.
// A promo's credits never expire, like a pack's.
const creditsOf = (grant: Grant) => {
  if (!isMeterCredit(grant)) {
    return;
  }
  const code = grant.benefit.metadata[POLAR_METADATA_KEY];
  const userId = grant.customer.external_id;
  if (typeof code !== "string" || typeof userId !== "string") {
    return;
  }
  const promo = promoOfTag(code);
  return {
    grant,
    grantId: grant.id,
    promoId: promo?.id,
    rollover: grant.benefit.properties.rollover,
    source:
      code === CREDIT_PACK_CODE || promo !== undefined
        ? ("pack" as const)
        : ("plan" as const),
    userId,
  };
};

// Why a promo grant brings no credits, if it doesn't.
const promoBlocked = async (
  db: Database,
  {
    grant,
    grantId,
    promoId,
    userId,
  }: NonNullable<ReturnType<typeof creditsOf>>,
  email: string
) => {
  if (promoId === undefined) {
    return;
  }
  // A promo that names its accounts credits no one else, whatever checkout
  // brought it. The redeem endpoint already refuses them.
  const promo = promoOfTag(grant.benefit.metadata[POLAR_METADATA_KEY]);
  if (promo !== undefined && !promoAllows(promo, email)) {
    return "not_allowed";
  }
  // One redemption per merchant per promo: a second one (two checkouts
  // finished at once) brings no credits. Polar's per-customer limit should
  // already have refused it.
  if (await promoRedeemed(db, { exceptGrantId: grantId, promoId, userId })) {
    return "already_redeemed";
  }
};

const onGrant = async ({ analytics, db }: WebhookDeps, grant: Grant) => {
  const credits = creditsOf(grant);
  const merchant =
    credits === undefined ? undefined : await merchantOf(db, credits.userId);
  if (credits === undefined || merchant === undefined) {
    return "skipped";
  }
  const { grant: data, ...ref } = credits;
  if (data.is_revoked) {
    return (await revokeGrant(db, ref)) ? "revoked" : "duplicate";
  }
  // Polar records each credit period on the grant; until it has credited
  // one, there is nothing to apply yet.
  const periodKey = data.properties.last_credited_at ?? data.granted_at;
  if (!data.is_granted || periodKey === null || periodKey === undefined) {
    return "pending";
  }
  const units =
    data.properties.last_credited_units ?? data.benefit.properties.units;
  const blocked = await promoBlocked(db, credits, merchant.email);
  if (blocked !== undefined) {
    return blocked;
  }
  const applied = await applyGrant(db, { ...ref, periodKey, units });
  if (applied && ref.promoId !== undefined) {
    analytics?.capture({
      distinctId: ref.userId,
      event: "promo_redeemed",
      properties: {
        // The promo's public id, never the secret code.
        code: ref.promoId,
        credits: units,
        surface: await redeemSurface(db, ref.userId, ref.promoId),
      },
    });
    return "granted";
  }
  // A pack is credited once, when it is bought.
  if (applied && ref.source === "pack") {
    analytics?.capture({
      distinctId: ref.userId,
      event: "credits_purchased",
      properties: {
        amount_usd: usd(billingCatalog().creditPack.priceCents),
        credits: units,
        pack: CREDIT_PACK_CODE,
      },
    });
  }
  return applied ? "granted" : "duplicate";
};

const onSubscription = async (
  deps: WebhookDeps,
  subscription: models.Subscription,
  revoked: boolean
) => {
  const userId = subscription.customer.external_id;
  const plan = subscription.product.metadata[POLAR_METADATA_KEY];
  if (typeof userId !== "string" || !isPlanCode(plan)) {
    return "skipped";
  }
  const merchant = await merchantOf(deps.db, userId);
  if (merchant === undefined) {
    return "skipped";
  }
  const prior = await storedSubscription(deps.db, subscription.id);
  const stored = await upsertSubscription(deps.db, {
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: new Date(subscription.current_period_end),
    id: subscription.id,
    modifiedAt: new Date(subscription.modified_at ?? subscription.created_at),
    plan,
    productId: subscription.product_id,
    status: subscription.status,
    userId,
  });
  if (!stored) {
    return "stale";
  }
  const status = revoked ? "revoked" : subscription.status;
  for (const { event, properties } of subscriptionEvents(prior, {
    amountCents: subscription.amount,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    interval: subscription.recurring_interval,
    plan,
    reason: subscription.customer_cancellation_reason,
    status,
    trial: subscription.status === "trialing",
  })) {
    deps.analytics?.capture({ distinctId: userId, event, properties });
  }
  const current = await entitlement(deps.db, userId);
  deps.analytics?.identify?.({
    distinctId: userId,
    properties: { plan: current.plan },
  });
  // A paid plan that ended leaves the merchant on Free again.
  if (revoked && plan !== "free" && current.subscription === null) {
    await ensureFreePlan(deps.polar, merchant);
  }
  return "mirrored";
};

// A customer the plugin created at sign-up starts on Free.
const onCustomer = async (deps: WebhookDeps, customer: models.Customer) => {
  const userId = customer.external_id;
  if (customer.type !== "individual" || typeof userId !== "string") {
    return "skipped";
  }
  const merchant = await merchantOf(deps.db, userId);
  if (merchant === undefined) {
    return "skipped";
  }
  const started = await ensureFreePlan(deps.polar, merchant);
  return started ? "free_plan" : "has_plan";
};

const route = async (deps: WebhookDeps, payload: Payload) => {
  switch (payload.type) {
    case "benefit_grant.created":
    case "benefit_grant.cycled":
    case "benefit_grant.updated":
    case "benefit_grant.revoked": {
      return await onGrant(deps, payload.data);
    }
    case "subscription.created":
    case "subscription.updated":
    case "subscription.active":
    case "subscription.canceled":
    case "subscription.uncanceled":
    case "subscription.past_due":
    case "subscription.revoked": {
      return await onSubscription(
        deps,
        payload.data,
        payload.type === "subscription.revoked"
      );
    }
    case "customer.created": {
      return await onCustomer(deps, payload.data);
    }
    default: {
      return "ignored";
    }
  }
};

export const handlePolarEvent = async (deps: WebhookDeps, payload: Payload) => {
  const outcome = await route(deps, payload);
  deps.log?.set({ polar: { event: payload.type, outcome } });
  return outcome;
};
