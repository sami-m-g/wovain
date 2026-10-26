import { createRunEngine } from "@wovain/api/workflows/engine";
import { createAuth } from "@wovain/auth";
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
export const auth = createAuth(ENV, db, mailer, analytics);
export const core = createCore(ENV);

// Runs execute on the durable engine; Inngest calls /api/inngest for each
// step (docs/adr/0001-durable-runs.md).
export const { handler: inngestHandler, runs } = createRunEngine({
  pool: db.$client,
  services: { core, db, mailer },
});
