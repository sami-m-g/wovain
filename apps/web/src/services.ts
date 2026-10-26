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
import { isFlagOn, MASTRA_RUNS } from "./lib/feature-flags";

export const db = createDb(ENV);
export const mailer = createMailer({
  apiKey: ENV.RESEND_API_KEY,
  from: ENV.EMAIL_FROM,
  siteUrl: ENV.BETTER_AUTH_URL,
});
export const billing = createBilling(ENV, isFlagOn);
export const auth = createAuth(ENV, db, mailer, analytics, billing.polar);

// Mastra's store (snapshots, memory, scores, traces) on the same database,
// in its own schema; the merchants' brand and taste memory lives there.
const { storage } = createMastraStorage(db.$client);
export const core = createCore(ENV, { memory: createMerchantMemory(storage) });

// Runs execute on the durable engine (Inngest calls /api/inngest for each
// step, docs/adr/0001-durable-runs.md) while the mastra-runs flag is on for
// the merchant, and on the legacy in-request flow otherwise.
export const { handler: inngestHandler, runs } = createRunEngine({
  // Cloud Run sets K_SERVICE: there, traces go to Cloud Trace.
  cloudTrace: process.env["K_SERVICE"] !== undefined,
  mastraFor: (userId) => isFlagOn(MASTRA_RUNS, userId),
  services: { analytics, billing, core, db, mailer },
  storage,
});
