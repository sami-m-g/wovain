import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createDb } from "@wovain/db";
import * as schema from "@wovain/db/schema/auth";
import { billingSubscription, creditGrant } from "@wovain/db/schema/billing";
import { betterAuth } from "better-auth";
import { createEmailVerificationToken } from "better-auth/api";
import { testUtils } from "better-auth/plugins";

import { ART_URL, artPng } from "../mocks/fal.ts";

// The pr suite's own Better Auth on the app's database and secret, with
// Better Auth's test utilities: it saves verified merchants and signs them
// in by cookie, and signs the email verification links the app would mail.
// The smoke suite has no database access: it signs in through the UI with
// the seeded smoke account (src/seed-smoke.ts).
const env = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

export const SMOKE_STATE = ".auth/smoke.json";

export const isSmoke = process.env["E2E_BASE_URL"] !== undefined;

const db = isSmoke
  ? undefined
  : createDb({ DATABASE_URL: env("DATABASE_URL") });

const testAuth =
  db === undefined
    ? undefined
    : betterAuth({
        baseURL: env("BETTER_AUTH_URL"),
        database: drizzleAdapter(db, {
          provider: "pg",
          schema,
        }),
        plugins: [testUtils()],
        secret: env("BETTER_AUTH_SECRET"),
        user: {
          additionalFields: { locale: { required: false, type: "string" } },
        },
      });

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

// The link the verification email carries (packages/auth: landOnDashboard).
export const verificationLink = async (email: string) => {
  const token = await createEmailVerificationToken(
    env("BETTER_AUTH_SECRET"),
    email
  );
  return `/api/auth/verify-email?token=${token}&callbackURL=%2Fdashboard`;
};

// The Free plan and its monthly credits, as Polar's webhooks mirror them
// (packages/billing/src/mirror.ts): the pr suite runs without Polar.
const FREE_CREDITS = 40;
const freePlanOf = async (userId: string) => {
  const now = new Date();
  await db?.insert(billingSubscription).values({
    cancelAtPeriodEnd: false,
    id: `e2e-sub-${userId}`,
    plan: "free",
    polarModifiedAt: now,
    productId: "e2e-free",
    status: "active",
    userId,
  });
  await db?.insert(creditGrant).values({
    id: `e2e-grant-${userId}`,
    periodKey: now.toISOString(),
    remaining: FREE_CREDITS,
    rollover: false,
    source: "plan",
    userId,
  });
};

export const signInWithPassword = async (
  page: Page,
  email: string,
  password: string
) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { exact: true, name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/u);
};

interface Fixtures {
  // A signed-in merchant: a new verified one per test (pr), or the seeded
  // smoke account (smoke).
  merchant: { email: string; id: string | undefined };
}

export const test = base.extend<Fixtures>({
  merchant: async ({ baseURL, page }, provide) => {
    if (testAuth === undefined) {
      const email = env("E2E_EMAIL");
      // Already signed in by smoke.setup.ts (storageState).
      await provide({ email, id: undefined });
      return;
    }
    const context = await testAuth.$context;
    const helpers = context.test;
    const email = uniqueEmail("merchant");
    const user = await helpers.saveUser(
      helpers.createUser({ email, emailVerified: true, name: "E2E Merchant" })
    );
    await freePlanOf(user.id);
    const cookies = await helpers.getCookies({
      domain: new URL(baseURL ?? "").hostname,
      userId: user.id,
    });
    await page.context().addCookies(cookies);
    await provide({ email, id: user.id });
    await helpers.deleteUser(user.id);
  },
  // The setup guide's first-visit spotlight (driver.js) covers the page:
  // every one counts as seen (apps/web use-spotlight.ts keeps them in
  // localStorage under this prefix).
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function getItem(key: string) {
        return key.startsWith("wovain.launch.spotlight.")
          ? "1"
          : original.call(this, key);
      };
    });
    // The mocked art (mocks/fal.ts) loads in the browser too.
    if (!isSmoke) {
      await page.route(ART_URL, (route) =>
        route.fulfill({ body: artPng, contentType: "image/png" })
      );
    }
    await provide(page);
  },
});

export { expect } from "@playwright/test";
