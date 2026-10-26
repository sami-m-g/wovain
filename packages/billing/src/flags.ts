// Billing's feature flags, read through one typed function so the reader can
// move onto the app's flag registry (GitLab feature flags through Unleash)
// without touching billing. Every flag is off unless the reader says on.

// Paid plans and credit packs: checkout, plan changes and pack purchases.
// Off while every merchant is on Free.
export const BILLING_PAID_PLANS = "billing-paid-plans";

export type BillingFlag = typeof BILLING_PAID_PLANS;

export type FlagReader = (flag: BillingFlag) => boolean;

export const flagsOff: FlagReader = () => false;
