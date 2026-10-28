import type { PolarCore, models } from "@polar-sh/sdk/2026-10";
import {
  clientConfirmCheckouts,
  createCheckouts,
} from "@polar-sh/sdk/2026-10/services/checkouts";
import { iterListDiscounts } from "@polar-sh/sdk/2026-10/services/discounts";
import type { Database } from "@wovain/db";
import { promoAttempt } from "@wovain/db/schema/billing";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { billingCatalog } from "./catalog";
import { merchantOf, promoRedeemed } from "./mirror";
import { POLAR_METADATA_KEY } from "./plans";
import { promoOfTag, promoPriceCents, promoTag } from "./promos";
import type { Promo } from "./promos";

// Redeeming a promo code (src/promos.ts): the code is checked against Polar's
// discounts, then a checkout for the promo's credit pack opens with the
// discount applied. A 100%-off checkout needs no payment, so it is
// confirmed here and the merchant never leaves wovain; the credits arrive by
// the webhook, like any purchase. While paid plans are off, only a code that
// takes the checkout to $0 is accepted.

// Where a merchant redeemed a code, for analytics.
export const REDEEM_SURFACES = ["billing"] as const;
export type RedeemSurface = (typeof REDEEM_SURFACES)[number];

// Why a code was refused. The API turns each into a typed error.
export type PromoRefusal =
  | "already_redeemed"
  | "expired"
  | "invalid"
  | "not_free"
  | "used_up";

// Attempts per merchant in a sliding window, refused or not
// (BILLING_CATALOG's redeemLimit).
const MS_PER_S = 1000;
export const redeemLimit = () => {
  const { attempts, windowSeconds } = billingCatalog().redeemLimit;
  return { attempts, windowMs: windowSeconds * MS_PER_S };
};

// A code as typed: Polar's codes are case insensitive.
export const normalizeCode = (code: string) => code.trim().toUpperCase();

export interface PromoDiscount {
  discount: models.Discount;
  promo: Promo;
}

// The Polar calls a redemption makes, so tests can stand in for Polar.
export interface PromoGateway {
  confirmFree: (
    checkout: models.Checkout,
    customer: { email: string; name: string }
  ) => Promise<void>;
  createCheckout: (input: {
    discountId: string;
    productId: string;
    promoId: string;
    returnUrl: string;
    successUrl: string;
    userId: string;
  }) => Promise<models.Checkout>;
  findDiscount: (code: string) => Promise<PromoDiscount | undefined>;
}

export const polarPromoGateway = (polar: PolarCore): PromoGateway => ({
  confirmFree: async (checkout, customer) => {
    await clientConfirmCheckouts(polar)(checkout.client_secret, {
      customer_email: customer.email,
      customer_name: customer.name,
    });
  },
  createCheckout: async (input) =>
    await createCheckouts(polar)({
      // The code is applied by the server and can't be swapped for another.
      allow_discount_codes: false,
      discount_id: input.discountId,
      external_customer_id: input.userId,
      metadata: { [POLAR_METADATA_KEY]: promoTag(input.promoId) },
      products: [input.productId],
      return_url: input.returnUrl,
      success_url: input.successUrl,
    }),
  findDiscount: async (code) => {
    const wanted = normalizeCode(code);
    let found: PromoDiscount | undefined;
    for await (const discount of iterListDiscounts(polar)()) {
      const promo = promoOfTag(discount.metadata[POLAR_METADATA_KEY]);
      if (
        promo !== undefined &&
        discount.code !== null &&
        normalizeCode(discount.code) === wanted
      ) {
        found = { discount, promo };
        break;
      }
    }
    return found;
  },
});

// A discount that takes its product to $0: 100% off, or a fixed amount at
// least its price. The checkout's own `is_payment_required` has the final say.
const isFullyFree = (discount: models.Discount, priceCents: number) =>
  "basis_points" in discount
    ? discount.basis_points >= 10_000
    : discount.amount >= priceCents;

const before = (iso: string | null | undefined, now: Date) =>
  iso !== null && iso !== undefined && new Date(iso).getTime() <= now.getTime();

// What the code can redeem, judged from the repo's definition and Polar's
// discount alike: either side can retire a code.
export const judgePromo = (
  { discount, promo }: PromoDiscount,
  { now, paidPlans }: { now: Date; paidPlans: boolean }
): { productId: string } | { refused: PromoRefusal } => {
  const product = discount.products.find(
    (item) => item.metadata[POLAR_METADATA_KEY] === promoTag(promo.id)
  );
  const startsAt = discount.starts_at ?? promo.startsAt;
  if (!promo.enabled || product === undefined || product.is_archived) {
    return { refused: "invalid" };
  }
  if (startsAt !== undefined && !before(startsAt, now)) {
    return { refused: "invalid" };
  }
  if (before(discount.ends_at, now) || before(promo.endsAt, now)) {
    return { refused: "expired" };
  }
  if (
    discount.max_redemptions !== null &&
    discount.redemptions_count >= discount.max_redemptions
  ) {
    return { refused: "used_up" };
  }
  if (!paidPlans && !isFullyFree(discount, promoPriceCents(promo))) {
    return { refused: "not_free" };
  }
  return { productId: product.id };
};

// Claims one of the merchant's attempts before anything else runs, Polar
// included: the count and the `pending` row it adds happen under a
// per-merchant advisory lock, so a burst of parallel requests is counted one
// by one and can't all pass the check together. Undefined when the window
// is full. An attempt that fails midway stays counted.
export const claimAttempt = async (
  db: Database,
  {
    now,
    surface,
    userId,
  }: { now: Date; surface: RedeemSurface; userId: string }
) =>
  await db.transaction(async (tx) => {
    const limit = redeemLimit();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [row] = await tx
      .select({ attempts: count() })
      .from(promoAttempt)
      .where(
        and(
          eq(promoAttempt.userId, userId),
          gte(promoAttempt.createdAt, new Date(now.getTime() - limit.windowMs))
        )
      );
    if ((row?.attempts ?? 0) >= limit.attempts) {
      return;
    }
    const [claimed] = await tx
      .insert(promoAttempt)
      .values({ createdAt: now, outcome: "pending", surface, userId })
      .returning({ id: promoAttempt.id });
    return claimed?.id;
  });

const settleAttempt = async (
  db: Database,
  id: string,
  outcome: "checkout" | PromoRefusal,
  promoId?: string
) => {
  await db
    .update(promoAttempt)
    .set({ outcome, promoId: promoId ?? null })
    .where(eq(promoAttempt.id, id));
};

// Where the checkout behind a promo grant was opened, for `promo_redeemed`.
export const redeemSurface = async (
  db: Database,
  userId: string,
  promoId: string
) => {
  const [row] = await db
    .select({ surface: promoAttempt.surface })
    .from(promoAttempt)
    .where(
      and(
        eq(promoAttempt.userId, userId),
        eq(promoAttempt.promoId, promoId),
        eq(promoAttempt.outcome, "checkout")
      )
    )
    .orderBy(desc(promoAttempt.createdAt))
    .limit(1);
  return row?.surface ?? "unknown";
};

export type RedeemResult =
  // Confirmed here: the credits are on their way by webhook.
  | { credits: number; promoId: string; status: "redeemed" }
  // Polar's checkout page, for a code that still needs a confirmation or a
  // payment there.
  | { credits: number; promoId: string; status: "checkout"; url: string }
  | { promoId?: string; refused: PromoRefusal; status: "refused" }
  | { status: "rate_limited" };

export interface RedeemInput {
  code: string;
  now?: Date;
  paidPlans: boolean;
  returnUrl: string;
  successUrl: string;
  surface: RedeemSurface;
  userId: string;
}

export const redeemPromo = async (
  db: Database,
  gateway: PromoGateway,
  input: RedeemInput
): Promise<RedeemResult> => {
  const { surface, userId } = input;
  const now = input.now ?? new Date();
  const attemptId = await claimAttempt(db, { now, surface, userId });
  if (attemptId === undefined) {
    return { status: "rate_limited" };
  }
  const refuse = async (
    refused: PromoRefusal,
    promoId?: string
  ): Promise<RedeemResult> => {
    await settleAttempt(db, attemptId, refused, promoId);
    return promoId === undefined
      ? { refused, status: "refused" }
      : { promoId, refused, status: "refused" };
  };
  const merchant = await merchantOf(db, userId);
  const found =
    merchant === undefined || normalizeCode(input.code) === ""
      ? undefined
      : await gateway.findDiscount(input.code);
  if (merchant === undefined || found === undefined) {
    return await refuse("invalid");
  }
  const { promo } = found;
  const verdict = judgePromo(found, { now, paidPlans: input.paidPlans });
  if ("refused" in verdict) {
    return await refuse(verdict.refused, promo.id);
  }
  if (await promoRedeemed(db, { promoId: promo.id, userId })) {
    return await refuse("already_redeemed", promo.id);
  }
  const checkout = await gateway.createCheckout({
    discountId: found.discount.id,
    productId: verdict.productId,
    promoId: promo.id,
    returnUrl: input.returnUrl,
    successUrl: input.successUrl,
    userId,
  });
  // Polar's own total is the last word on "free": while paid plans are off,
  // nothing that would charge the merchant goes through.
  if (checkout.is_payment_required && !input.paidPlans) {
    return await refuse("not_free", promo.id);
  }
  await settleAttempt(db, attemptId, "checkout", promo.id);
  const opened = {
    credits: promo.credits,
    promoId: promo.id,
    status: "checkout" as const,
    url: checkout.url,
  };
  if (checkout.is_payment_form_required) {
    return opened;
  }
  try {
    await gateway.confirmFree(checkout, merchant);
  } catch {
    // Polar wants something more (a billing address, say): its page asks.
    return opened;
  }
  return { credits: promo.credits, promoId: promo.id, status: "redeemed" };
};
