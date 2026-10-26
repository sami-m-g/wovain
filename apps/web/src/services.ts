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
