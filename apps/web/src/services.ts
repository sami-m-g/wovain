import { createAuth } from "@wovain/auth";
import { createBilling } from "@wovain/billing/service";
import { createCore } from "@wovain/core/core";
import { createDb } from "@wovain/db";
import { createMailer } from "@wovain/email/mailer";

import { ENV } from "./env.server";
import { analytics } from "./lib/analytics";

export const db = createDb(ENV);
export const mailer = createMailer({
  apiKey: ENV.RESEND_API_KEY,
  from: ENV.EMAIL_FROM,
  siteUrl: ENV.BETTER_AUTH_URL,
});
export const core = createCore(ENV);
// Billing reads its flags (billing-paid-plans) from the typed registry.
export const billing = createBilling(ENV, (flag) => core.flags.isOn(flag));
export const auth = createAuth(ENV, db, mailer, analytics, billing.polar);
