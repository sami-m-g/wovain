import type { models } from "@polar-sh/sdk/2026-10";
import type { Database } from "@wovain/db";
import { promoAttempt } from "@wovain/db/schema/billing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { billingCatalog } from "../src/catalog";
import { applyGrant } from "../src/mirror";
import { promoTag } from "../src/promos";
import type { Promo } from "../src/promos";
import { judgePromo, redeemLimit, redeemPromo } from "../src/redeem";
import type { PromoDiscount, PromoGateway, RedeemInput } from "../src/redeem";
import { addUser, createTestDb } from "../src/testing";

// Redeeming a promo code against a stand-in for Polar, on a real Postgres
// (PGlite): the checks, the rate limit and one redemption per merchant.

const NOW = new Date("2026-10-26T10:00:00Z");
const [JUDGES] = billingCatalog().promos;
if (JUDGES === undefined) {
  throw new Error("The test catalog has no promo");
}
const REDEEM_LIMIT = redeemLimit();

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;
let userId: string;

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
  userId = await addUser(db, "merchant");
});

afterAll(async () => {
  await close();
});

const promoProduct = (
  promo: Promo,
  archived = false
): models.DiscountProduct => ({
  created_at: NOW.toISOString(),
  description: null,
  id: `prod_${promo.id}`,
  is_archived: archived,
  is_recurring: false,
  metadata: { wovain: promoTag(promo.id) },
  meter_interval: null,
  meter_interval_count: null,
  modified_at: null,
  name: `wovain ${promo.name} promo`,
  organization_id: "org_test",
  recurring_interval: null,
  recurring_interval_count: null,
  trial_interval: null,
  trial_interval_count: null,
  visibility: "private",
});

const discountFor = (
  promo: Promo,
  overrides: Partial<models.DiscountPercentageOnceForeverDuration> = {}
): PromoDiscount => ({
  discount: {
    basis_points: 10_000,
    code: "TESTCODE",
    created_at: NOW.toISOString(),
    duration: "once",
    ends_at: promo.endsAt,
    id: `disc_${promo.id}`,
    max_redemptions: promo.maxRedemptions,
    max_redemptions_per_customer: 1,
    metadata: { wovain: promoTag(promo.id) },
    modified_at: null,
    name: `wovain ${promo.name}`,
    organization_id: "org_test",
    products: [promoProduct(promo)],
    redemptions_count: 0,
    starts_at: null,
    type: "percentage",
    ...overrides,
  },
  promo,
});

// What Polar's checkout says about the total, the rest unused here.
const checkout = (paymentRequired = false) =>
  ({
    client_secret: "cs_secret",
    id: "co_1",
    is_payment_form_required: paymentRequired,
    is_payment_required: paymentRequired,
    url: "https://sandbox.polar.sh/checkout/co_1",
  }) as unknown as models.Checkout;

const gateway = (
  found?: PromoDiscount,
  options: { confirmFails?: boolean; paymentRequired?: boolean } = {}
) => ({
  confirmFree: vi.fn(() =>
    options.confirmFails === true
      ? Promise.reject(new Error("billing address required"))
      : Promise.resolve()
  ),
  createCheckout: vi.fn(() =>
    Promise.resolve(checkout(options.paymentRequired))
  ),
  findDiscount: vi.fn(() => Promise.resolve(found)),
});

const input = (overrides: Partial<RedeemInput> = {}): RedeemInput => ({
  code: "testcode",
  now: NOW,
  paidPlans: false,
  returnUrl: "http://localhost:3001/dashboard/billing",
  successUrl: "http://localhost:3001/dashboard/billing?redeemed=1",
  surface: "billing",
  userId,
  ...overrides,
});

const redeem = async (polar: PromoGateway, overrides?: Partial<RedeemInput>) =>
  await redeemPromo(db, polar, input(overrides));

it("confirms a free code in place, with the merchant on the checkout", async () => {
  const polar = gateway(discountFor(JUDGES));
  expect(await redeem(polar)).toStrictEqual({
    credits: 300,
    promoId: "judges-2026",
    status: "redeemed",
  });
  expect(polar.createCheckout).toHaveBeenCalledWith(
    expect.objectContaining({
      discountId: "disc_judges-2026",
      productId: "prod_judges-2026",
      userId,
    })
  );
  expect(polar.confirmFree).toHaveBeenCalledWith(expect.anything(), {
    email: "merchant@example.com",
    id: userId,
    name: "merchant",
  });
  const attempts = await db
    .select()
    .from(promoAttempt)
    .where(eq(promoAttempt.userId, userId));
  expect(attempts).toMatchObject([
    { outcome: "checkout", promoId: "judges-2026", surface: "billing" },
  ]);
});

it("falls back to Polar's page when the free checkout can't be confirmed here", async () => {
  const polar = gateway(discountFor(JUDGES), { confirmFails: true });
  expect(await redeem(polar)).toMatchObject({
    status: "checkout",
    url: "https://sandbox.polar.sh/checkout/co_1",
  });
});

it("refuses an unknown code without calling Polar's checkout", async () => {
  const polar = gateway();
  expect(await redeem(polar)).toStrictEqual({
    refused: "invalid",
    status: "refused",
  });
  expect(polar.createCheckout).not.toHaveBeenCalled();
});

it("refuses an expired, used up or disabled code", () => {
  expect(
    judgePromo(discountFor(JUDGES), {
      now: new Date("2026-12-17T00:00:00Z"),
      paidPlans: false,
    })
  ).toStrictEqual({ refused: "expired" });
  expect(
    judgePromo(discountFor(JUDGES, { redemptions_count: 50 }), {
      now: NOW,
      paidPlans: false,
    })
  ).toStrictEqual({ refused: "used_up" });
  expect(
    judgePromo(discountFor({ ...JUDGES, enabled: false }), {
      now: NOW,
      paidPlans: false,
    })
  ).toStrictEqual({ refused: "invalid" });
  expect(
    judgePromo(
      discountFor(JUDGES, { products: [promoProduct(JUDGES, true)] }),
      { now: NOW, paidPlans: false }
    )
  ).toStrictEqual({ refused: "invalid" });
});

it("refuses a code that isn't free while paid plans are off", async () => {
  const half = discountFor(JUDGES, { basis_points: 5000 });
  expect(await redeem(gateway(half))).toMatchObject({ refused: "not_free" });
  // With paid plans on, the same code opens Polar's checkout to pay the rest.
  expect(
    await redeem(gateway(half, { paymentRequired: true }), { paidPlans: true })
  ).toMatchObject({ status: "checkout" });
});

it("trusts Polar's total over the discount's terms", async () => {
  const polar = gateway(discountFor(JUDGES), { paymentRequired: true });
  expect(await redeem(polar)).toMatchObject({ refused: "not_free" });
  expect(polar.confirmFree).not.toHaveBeenCalled();
});

it("lets a merchant redeem a promo once", async () => {
  await applyGrant(db, {
    grantId: "grant_promo",
    periodKey: NOW.toISOString(),
    promoId: "judges-2026",
    rollover: true,
    source: "pack",
    units: 300,
    userId,
  });
  const polar = gateway(discountFor(JUDGES));
  expect(await redeem(polar)).toMatchObject({ refused: "already_redeemed" });
  expect(polar.createCheckout).not.toHaveBeenCalled();
});

it("rate-limits attempts per merchant, refused ones included", async () => {
  const polar = gateway();
  for (let attempt = 0; attempt < REDEEM_LIMIT.attempts; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    expect(await redeem(polar)).toMatchObject({ status: "refused" });
  }
  expect(await redeem(polar)).toStrictEqual({ status: "rate_limited" });
  // The window slides: later, the merchant can try again.
  expect(
    await redeem(polar, {
      now: new Date(NOW.getTime() + REDEEM_LIMIT.windowMs + 60_000),
    })
  ).toMatchObject({ status: "refused" });
});

it("counts a parallel burst one by one, before calling Polar", async () => {
  const polar = gateway();
  const burst = REDEEM_LIMIT.attempts + 3;
  const results = await Promise.all(
    Array.from({ length: burst }, async () => await redeem(polar))
  );
  expect(
    results.filter((result) => result.status === "rate_limited")
  ).toHaveLength(burst - REDEEM_LIMIT.attempts);
  expect(polar.findDiscount).toHaveBeenCalledTimes(REDEEM_LIMIT.attempts);
});
