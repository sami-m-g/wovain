import { createRunEngine } from "@wovain/api/workflows/engine";
import { createMastraStorage } from "@wovain/api/workflows/storage";
import { createAuth } from "@wovain/auth";
import { createBilling } from "@wovain/billing/service";
import { createCore } from "@wovain/core/core";
import { createMerchantMemory } from "@wovain/core/taste";
import { createDb } from "@wovain/db";
import { createMailer } from "@wovain/email/mailer";

import { ENV } from "./env.server";
import { analytics } from "./lib/analytics";

export const db = createDb(ENV);
export const mailer = createMailer({
  apiKey: ENV.RESEND_API_KEY,
  from: ENV.EMAIL_FROM,
  replyTo: ENV.EMAIL_REPLY_TO,
  siteUrl: ENV.BETTER_AUTH_URL,
  unsubscribeSecret: ENV.BETTER_AUTH_SECRET,
});

// Mastra's store (snapshots, memory, scores, traces) on the same database,
// in its own schema; the merchants' brand and taste memory lives there.
const { storage } = createMastraStorage(db.$client);
export const core = createCore(ENV, { memory: createMerchantMemory(storage) });
// Billing reads its flags (billing-paid-plans) from the typed registry.
export const billing = createBilling(ENV, (flag) => core.flags.isOn(flag));
export const auth = createAuth(ENV, db, mailer, analytics, billing.polar);

// Runs execute on the durable engine (Inngest calls /api/inngest for each
// step, docs/adr/0001-durable-runs.md) while the mastra-runs flag is on for
// the merchant, and on the legacy in-request flow otherwise.
export const {
  events,
  handler: inngestHandler,
  runs,
} = createRunEngine({
  appId: ENV.INNGEST_APP_ID,
  // Cloud Run sets K_SERVICE: there, traces go to Cloud Trace.
  cloudTrace: process.env["K_SERVICE"] !== undefined,
  mastraFor: (userId) => core.flags.isOn("mastra-runs", { userId }),
  // The OTLP backend gets them too when it's configured (src/lib/otel.ts).
  otlpEndpoint: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  services: { analytics, billing, core, db, mailer },
  storage,
});
