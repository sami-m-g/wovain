import type { PolarCore } from "@polar-sh/sdk/2026-10";

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
  polar: PolarCore | undefined;
}

export const createBilling = (env: BillingConfig): Billing => ({
  appUrl: env.BETTER_AUTH_URL,
  polar: createPolarClient(env),
});
