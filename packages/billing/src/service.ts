import type { PolarCore } from "@polar-sh/sdk/2026-10";

import { BILLING_PAID_PLANS, flagsOff } from "./flags";
import type { FlagReader } from "./flags";
import { createPolarClient } from "./polar";
import type { PolarConfig } from "./polar";

// What the app needs for billing, built once per server process. Without a
// Polar token, checkout and the portal answer NOT_CONFIGURED; credits are
// still enforced, so no paid step runs without a grant from Polar.
export interface BillingConfig extends PolarConfig {
  BETTER_AUTH_URL: string;
  POLAR_WEBHOOK_SECRET?: string | undefined;
}

export interface Billing {
  // The site origin, for Polar's success and return URLs.
  appUrl: string;
  // Whether paid plans and credit packs are on sale (`billing-paid-plans`).
  paidPlans: () => Promise<boolean>;
  polar: PolarCore | undefined;
}

export const createBilling = (
  env: BillingConfig,
  isFlagOn: FlagReader = flagsOff
): Billing => ({
  appUrl: env.BETTER_AUTH_URL,
  paidPlans: async () => await isFlagOn(BILLING_PAID_PLANS),
  polar: createPolarClient(env),
});
