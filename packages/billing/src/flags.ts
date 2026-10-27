// Billing's feature flags, read through one typed function so billing doesn't
// depend on the app's flag registry (PostHog feature flags). Every flag is
// off unless the reader says on.

// Paid plans and credit packs: checkout, plan changes and pack purchases.
// Off while every merchant is on Free.
export const BILLING_PAID_PLANS = "billing-paid-plans";

export type BillingFlag = typeof BILLING_PAID_PLANS;

export type FlagReader = (flag: BillingFlag) => Promise<boolean>;

export const flagsOff: FlagReader = async () => await Promise.resolve(false);
