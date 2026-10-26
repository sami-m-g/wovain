import { createRunEngine } from "@wovain/api/workflows/engine";
import { createAuth } from "@wovain/auth";
import { createCore } from "@wovain/core/core";
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
export const auth = createAuth(ENV, db, mailer, analytics);
export const core = createCore(ENV);

// Runs execute on the durable engine (Inngest calls /api/inngest for each
// step, docs/adr/0001-durable-runs.md) while the mastra-runs flag is on for
// the merchant, and on the legacy in-request flow otherwise.
export const { handler: inngestHandler, runs } = createRunEngine({
  mastraFor: (userId) => isFlagOn(MASTRA_RUNS, userId),
  pool: db.$client,
  services: { analytics, core, db, mailer },
});
