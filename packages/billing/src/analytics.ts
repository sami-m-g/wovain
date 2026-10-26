// Billing's product analytics (PostHog in apps/web), keyed by user id:
// revenue and usage events for the KPI dashboards, and the merchant's `plan`
// as a person property. Absent when the app has no PostHog key.

export type BillingEvent =
  | "credits_consumed"
  | "credits_purchased"
  | "promo_redeemed"
  | "subscription_canceled"
  | "subscription_changed"
  | "subscription_started";

export interface BillingAnalytics {
  capture: (event: {
    distinctId: string;
    event: BillingEvent;
    properties?: Record<string, unknown>;
  }) => void;
  // Sets person properties (PostHog `$set`).
  identify?:
    | ((person: {
        distinctId: string;
        properties: Record<string, unknown>;
      }) => void)
    | undefined;
}

// Polar amounts are cents; the events carry US dollars.
export const usd = (cents: number) => cents / 100;
