import type { Database } from "@wovain/db";
import { user } from "@wovain/db/schema/auth";
import {
  billingSubscription,
  creditGrant,
  creditLedger,
} from "@wovain/db/schema/billing";
import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { billingCatalog } from "./catalog";
import { isPlanCode } from "./plans";
import type { PlanCode } from "./plans";

// Polar's state, copied into Postgres. Only webhooks call the writers here
// (src/webhooks.ts), and each one is idempotent and safe to receive out of
// order: Polar retries and may reorder deliveries.

export interface GrantCredits {
  grantId: string;
  // The credit period: Polar's last_credited_at for the grant.
  periodKey: string;
  // The promo behind a redeemed code's credits (src/promos.ts).
  promoId?: string | undefined;
  rollover: boolean;
  source: "plan" | "pack";
  units: number;
  userId: string;
}

type GrantRef = Pick<
  GrantCredits,
  "grantId" | "promoId" | "rollover" | "source" | "userId"
>;

// The grant row, created empty if this is its first event, then locked so
// concurrent deliveries for one grant apply one at a time. Undefined for a
// promo grant when the merchant already holds another grant of that promo
// (credit_grant_user_promo_idx): one redemption per merchant per promo.
const lockGrant = async (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  { grantId, promoId, rollover, source, userId }: GrantRef
) => {
  await tx
    .insert(creditGrant)
    .values({
      id: grantId,
      periodKey: "",
      promoId: promoId ?? null,
      remaining: 0,
      rollover,
      source,
      userId,
    })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(creditGrant)
    .where(eq(creditGrant.id, grantId))
    .for("update");
  if (row === undefined && promoId === undefined) {
    throw new Error(`Credit grant ${grantId} wasn't saved`);
  }
  return row;
};

// Whether the merchant holds a grant of this promo other than `grantId`: a
// second redemption, which brings no credits.
export const promoRedeemed = async (
  db: Database,
  {
    exceptGrantId,
    promoId,
    userId,
  }: { exceptGrantId?: string; promoId: string; userId: string }
) => {
  const rows = await db
    .select({ id: creditGrant.id })
    .from(creditGrant)
    .where(
      and(eq(creditGrant.userId, userId), eq(creditGrant.promoId, promoId))
    );
  return rows.some((row) => row.id !== exceptGrantId);
};

// A new credit period for a grant: its units replace what was left (which
// expires) or, with rollover, add to it. A period at or before the stored one
// is a redelivery or a late event, and changes nothing.
export const applyGrant = async (db: Database, grant: GrantCredits) =>
  await db.transaction(async (tx) => {
    const row = await lockGrant(tx, grant);
    if (
      row === undefined ||
      row.revokedAt !== null ||
      grant.periodKey <= row.periodKey
    ) {
      return false;
    }
    const expired = grant.rollover ? 0 : row.remaining;
    await tx
      .update(creditGrant)
      .set({
        periodKey: grant.periodKey,
        remaining: grant.rollover ? row.remaining + grant.units : grant.units,
        rollover: grant.rollover,
        source: grant.source,
      })
      .where(eq(creditGrant.id, grant.grantId));
    const entry = (
      reason: "expire" | "grant",
      delta: number
    ): typeof creditLedger.$inferInsert => ({
      delta,
      grantId: grant.grantId,
      idempotencyKey: `${reason}:${grant.grantId}:${grant.periodKey}`,
      note:
        reason === "grant" && grant.promoId !== undefined
          ? `promo ${grant.promoId}`
          : null,
      reason,
      userId: grant.userId,
    });
    await tx
      .insert(creditLedger)
      .values(
        expired > 0
          ? [entry("expire", -expired), entry("grant", grant.units)]
          : [entry("grant", grant.units)]
      )
      .onConflictDoNothing();
    return true;
  });

// A revoked grant (a cancelled plan, a refunded pack): what's left of it is
// gone, and later events for it change nothing.
export const revokeGrant = async (db: Database, grant: GrantRef) =>
  await db.transaction(async (tx) => {
    const row = await lockGrant(tx, grant);
    if (row === undefined || row.revokedAt !== null) {
      return false;
    }
    await tx
      .update(creditGrant)
      .set({ remaining: 0, revokedAt: new Date() })
      .where(eq(creditGrant.id, grant.grantId));
    if (row.remaining > 0) {
      await tx
        .insert(creditLedger)
        .values({
          delta: -row.remaining,
          grantId: grant.grantId,
          idempotencyKey: `revoke:${grant.grantId}`,
          reason: "revoke",
          userId: grant.userId,
        })
        .onConflictDoNothing();
    }
    return true;
  });

export interface SubscriptionCopy {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  id: string;
  modifiedAt: Date;
  plan: PlanCode;
  productId: string;
  status: string;
  userId: string;
}

// Stores Polar's copy of a subscription unless a newer one is already here.
export const upsertSubscription = async (
  db: Database,
  copy: SubscriptionCopy
) => {
  const values = {
    cancelAtPeriodEnd: copy.cancelAtPeriodEnd,
    currentPeriodEnd: copy.currentPeriodEnd,
    id: copy.id,
    plan: copy.plan,
    polarModifiedAt: copy.modifiedAt,
    productId: copy.productId,
    status: copy.status,
    userId: copy.userId,
  };
  const stored = await db
    .insert(billingSubscription)
    .values(values)
    .onConflictDoUpdate({
      set: {
        cancelAtPeriodEnd: sql`excluded.cancel_at_period_end`,
        currentPeriodEnd: sql`excluded.current_period_end`,
        plan: sql`excluded.plan`,
        polarModifiedAt: sql`excluded.polar_modified_at`,
        productId: sql`excluded.product_id`,
        status: sql`excluded.status`,
      },
      setWhere: lte(
        billingSubscription.polarModifiedAt,
        sql`excluded.polar_modified_at`
      ),
      target: billingSubscription.id,
    })
    .returning({ id: billingSubscription.id });
  return stored.length > 0;
};

// The stored copy of a subscription, before a webhook changes it.
export const storedSubscription = async (db: Database, id: string) => {
  const [row] = await db
    .select({
      cancelAtPeriodEnd: billingSubscription.cancelAtPeriodEnd,
      plan: billingSubscription.plan,
      status: billingSubscription.status,
    })
    .from(billingSubscription)
    .where(eq(billingSubscription.id, id));
  return row !== undefined && isPlanCode(row.plan)
    ? { ...row, plan: row.plan }
    : undefined;
};

// Polar statuses that carry a plan's features.
const ENTITLED = ["active", "trialing"];

export interface Entitlement {
  plan: PlanCode;
  subscription: {
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    id: string;
    status: string;
  } | null;
}

// The merchant's plan: their best entitled subscription, else Free.
export const entitlement = async (
  db: Database,
  userId: string
): Promise<Entitlement> => {
  const rows = await db
    .select()
    .from(billingSubscription)
    .where(
      and(
        eq(billingSubscription.userId, userId),
        inArray(billingSubscription.status, ENTITLED)
      )
    );
  const { plans } = billingCatalog();
  const [best] = rows
    .flatMap(({ plan, ...row }) => (isPlanCode(plan) ? [{ ...row, plan }] : []))
    .toSorted((a, b) => plans[b.plan].rank - plans[a.plan].rank);
  if (best === undefined) {
    return { plan: "free", subscription: null };
  }
  return {
    plan: best.plan,
    subscription: {
      cancelAtPeriodEnd: best.cancelAtPeriodEnd,
      currentPeriodEnd: best.currentPeriodEnd,
      id: best.id,
      status: best.status,
    },
  };
};

// The wovain user behind a webhook's external customer ID; undefined for
// anyone else (a customer made by hand in the dashboard), whose events are
// skipped.
export const merchantOf = async (db: Database, userId: string) => {
  const [row] = await db
    .select({ email: user.email, id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return row;
};
