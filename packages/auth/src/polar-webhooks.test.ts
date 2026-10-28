import { createHmac } from "node:crypto";

import { createPolarCore } from "@polar-sh/sdk/2026-10";
import type { models, webhooks } from "@polar-sh/sdk/2026-10";
import { creditBalance } from "@wovain/billing/credits";
import { entitlement } from "@wovain/billing/mirror";
import { addUser, createTestDb } from "@wovain/billing/testing";
import type { Database } from "@wovain/db";
import { creditLedger, promoAttempt } from "@wovain/db/schema/billing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { createAuth } from "./index";

// Polar's webhooks end to end: a signed delivery to the Better Auth plugin's
// endpoint, its signature check, and the mirror into Postgres. Payloads are
// typed against the SDK's own webhook types, so they can't drift from what
// Polar sends; deliveries are signed the way `polar webhook listen` signs
// them (Standard Webhooks).

const SECRET = "polar_whs_test_secret";
const URL_BASE = "http://localhost:3001";
const NOW = "2026-10-26T10:00:00Z";

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;
let userId: string;
let auth: ReturnType<typeof createAuth>;
const capture = vi.fn();
const identify = vi.fn();

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
  userId = await addUser(db, "merchant");
  auth = createAuth(
    {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
      BETTER_AUTH_URL: URL_BASE,
      MCP_URL: `${URL_BASE}/api/mcp`,
      POLAR_WEBHOOK_SECRET: SECRET,
    },
    db,
    vi.fn(async () => {}),
    { capture, identify },
    // Never called by these events: they only touch Postgres.
    createPolarCore({ accessToken: "polar_oat_test", environment: "sandbox" })
  );
  capture.mockClear();
  identify.mockClear();
});

afterAll(async () => {
  await close();
});

const sign = (id: string, timestamp: number, body: string) =>
  `v1,${createHmac("sha256", SECRET)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64")}`;

let delivery = 0;
const deliver = async (
  payload: webhooks.WebhookPayload,
  signature?: string
) => {
  delivery += 1;
  const id = `msg_${delivery}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  return await auth.handler(
    new Request(`${URL_BASE}/api/auth/polar/webhooks`, {
      body,
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-signature": signature ?? sign(id, timestamp, body),
        "webhook-timestamp": String(timestamp),
      },
      method: "POST",
    })
  );
};

const customer = (externalId: string): models.Customer => ({
  avatar_url: null,
  billing_address: null,
  billing_name: null,
  created_at: NOW,
  deleted_at: null,
  email: `${externalId}@example.com`,
  email_verified: true,
  external_id: externalId,
  first_user_event_at: null,
  id: `cus_${externalId}`,
  metadata: {},
  modified_at: null,
  name: externalId,
  organization_id: "org_test",
  tax_id: null,
  type: "individual",
});

const benefit = (
  code: string,
  units: number,
  rollover: boolean
): models.BenefitMeterCredit => ({
  created_at: NOW,
  deletable: true,
  description: `${units} wovain credits`,
  id: `ben_${code}`,
  is_deleted: false,
  metadata: { wovain: code },
  modified_at: null,
  organization_id: "org_test",
  properties: { meter_id: "meter_credits", rollover, units },
  selectable: true,
  type: "meter_credit",
  visibility: "public",
  visibility_configurable: true,
});

const grantEvent = (
  type: "benefit_grant.created" | "benefit_grant.cycled",
  {
    code = "studio",
    creditedAt = NOW,
    externalId = userId,
    grantId = `grant_${code}`,
    order = false,
    rollover = false,
    units = 300,
  }: {
    code?: string;
    creditedAt?: string;
    externalId?: string;
    grantId?: string;
    // A one-time purchase's grant (an order) rather than a subscription's.
    order?: boolean;
    rollover?: boolean;
    units?: number;
  } = {}
): webhooks.WebhookPayload => ({
  api_version: "2026-10",
  data: {
    benefit: benefit(code, units, rollover),
    benefit_id: `ben_${code}`,
    created_at: NOW,
    customer: customer(externalId),
    customer_id: `cus_${externalId}`,
    granted_at: NOW,
    id: grantId,
    is_granted: true,
    is_revoked: false,
    modified_at: creditedAt,
    order_id: order ? `order_${grantId}` : null,
    properties: {
      last_credited_at: creditedAt,
      last_credited_meter_id: "meter_credits",
      last_credited_units: units,
    },
    subscription_id: order ? null : `sub_${code}`,
  },
  timestamp: creditedAt,
  type,
});

const product = (code: string): models.Product => ({
  attached_custom_fields: [],
  benefits: [],
  created_at: NOW,
  description: null,
  id: `prod_${code}`,
  is_archived: false,
  is_deletable: false,
  is_recurring: true,
  medias: [],
  metadata: { wovain: code },
  meter_interval: null,
  meter_interval_count: null,
  modified_at: null,
  name: `wovain ${code}`,
  organization_id: "org_test",
  prices: [],
  recurring_interval: "month",
  recurring_interval_count: 1,
  trial_interval: null,
  trial_interval_count: null,
  visibility: "public",
});

const subscriptionEvent = (
  type: "subscription.active" | "subscription.canceled",
  {
    amount = 2900,
    cancelAtPeriodEnd = false,
    code = "studio",
    modifiedAt = NOW,
  }: {
    amount?: number;
    cancelAtPeriodEnd?: boolean;
    code?: string;
    modifiedAt?: string;
  } = {}
): webhooks.WebhookPayload => ({
  api_version: "2026-10",
  data: {
    amount,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: null,
    checkout_id: null,
    created_at: NOW,
    currency: "usd",
    current_meter_period_end: null,
    current_meter_period_start: null,
    current_period_end: "2026-11-26T10:00:00Z",
    current_period_start: NOW,
    customer: customer(userId),
    customer_cancellation_comment: null,
    customer_cancellation_reason: null,
    customer_id: `cus_${userId}`,
    discount: null,
    discount_id: null,
    ended_at: null,
    ends_at: null,
    id: "sub_main",
    metadata: {},
    meters: [],
    modified_at: modifiedAt,
    pause_at_period_end: false,
    paused_at: null,
    pending_update: null,
    prices: [],
    product: product(code),
    product_id: `prod_${code}`,
    recurring_interval: "month",
    recurring_interval_count: 1,
    resumes_at: null,
    started_at: NOW,
    status: "active",
    trial_end: null,
    trial_start: null,
    units: null,
  },
  timestamp: modifiedAt,
  type,
});

it("rejects a delivery with a bad signature", async () => {
  const response = await deliver(grantEvent("benefit_grant.created"), "v1,bad");
  expect(response.status).toBe(403);
  expect(await creditBalance(db, userId)).toMatchObject({ available: 0 });
});

it("grants a plan's credits once, even when Polar redelivers", async () => {
  const first = await deliver(grantEvent("benefit_grant.created"));
  const again = await deliver(grantEvent("benefit_grant.created"));
  expect([first.status, again.status]).toStrictEqual([200, 200]);
  expect(await creditBalance(db, userId)).toStrictEqual({
    available: 300,
    pack: 0,
    plan: 300,
  });
});

it("resets the plan's credits on a new cycle", async () => {
  await deliver(grantEvent("benefit_grant.created"));
  await deliver(
    grantEvent("benefit_grant.cycled", { creditedAt: "2026-11-26T10:00:00Z" })
  );
  expect(await creditBalance(db, userId)).toMatchObject({ plan: 300 });
});

it("records a pack purchase", async () => {
  await deliver(
    grantEvent("benefit_grant.created", { code: "pack", units: 100 })
  );
  expect(await creditBalance(db, userId)).toMatchObject({ pack: 100 });
  expect(capture).toHaveBeenCalledWith({
    distinctId: userId,
    event: "credits_purchased",
    properties: { amount_usd: 10, credits: 100, pack: "pack" },
  });
});

it("skips a customer who isn't a wovain user", async () => {
  const response = await deliver(
    grantEvent("benefit_grant.created", { externalId: "stranger" })
  );
  expect(response.status).toBe(200);
  expect(await creditBalance(db, "stranger")).toMatchObject({ available: 0 });
});

it("mirrors a paid subscription and its cancellation, with KPI events", async () => {
  await deliver(subscriptionEvent("subscription.active"));
  expect(await entitlement(db, userId)).toMatchObject({ plan: "studio" });
  expect(identify).toHaveBeenCalledWith({
    distinctId: userId,
    properties: { plan: "studio" },
  });
  await deliver(
    subscriptionEvent("subscription.canceled", {
      cancelAtPeriodEnd: true,
      modifiedAt: "2026-10-27T10:00:00Z",
    })
  );
  expect(capture.mock.calls.map(([call]) => call.event)).toStrictEqual([
    "subscription_started",
    "subscription_canceled",
  ]);
  // Still Studio until the period ends.
  expect(await entitlement(db, userId)).toMatchObject({
    plan: "studio",
    subscription: { cancelAtPeriodEnd: true },
  });
});

// A promo code's credits: the grant of its credit pack product, bought at $0
// with the 100%-off discount (packages/billing/src/promos.ts).
const promoGrant = (grantId: string) =>
  grantEvent("benefit_grant.created", {
    code: "promo:judges-2026",
    grantId,
    order: true,
    rollover: true,
    units: 300,
  });

it("grants a promo code's credits once, noted in the ledger", async () => {
  await db.insert(promoAttempt).values({
    outcome: "checkout",
    promoId: "judges-2026",
    surface: "billing",
    userId,
  });
  const first = await deliver(promoGrant("grant_promo_1"));
  const again = await deliver(promoGrant("grant_promo_1"));
  expect([first.status, again.status]).toStrictEqual([200, 200]);
  expect(await creditBalance(db, userId)).toStrictEqual({
    available: 300,
    pack: 300,
    plan: 0,
  });
  const entries = await db
    .select({ delta: creditLedger.delta, note: creditLedger.note })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  expect(entries).toStrictEqual([{ delta: 300, note: "promo judges-2026" }]);
  expect(capture).toHaveBeenCalledOnce();
  expect(capture).toHaveBeenCalledWith({
    distinctId: userId,
    event: "promo_redeemed",
    properties: { code: "judges-2026", credits: 300, surface: "billing" },
  });
});

it("gives a merchant a promo's credits only once, even from two orders", async () => {
  await deliver(promoGrant("grant_promo_1"));
  const second = await deliver(promoGrant("grant_promo_2"));
  expect(second.status).toBe(200);
  expect(await creditBalance(db, userId)).toMatchObject({ pack: 300 });
  expect(capture).toHaveBeenCalledOnce();
});
