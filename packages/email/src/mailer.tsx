import { render } from "@react-email/render";
import { defineError, log } from "evlog";
import { Resend } from "resend";

import { compose, pickLocale } from "./emails";
import type { Message } from "./emails";

// Sends wovain's emails through Resend. Without RESEND_API_KEY (local
// development), each email is logged instead of sent.

const ResendFailed = defineError("RESEND_FAILED", {
  fix: "Check RESEND_API_KEY and that EMAIL_FROM's domain is verified in Resend.",
  message: ({ kind }: { kind: string }) => `Couldn't send the ${kind} email`,
  status: 502,
});

export interface MailerConfig {
  apiKey: string | undefined;
  from: string;
  // Links given as a path ("/dashboard") point at this site.
  siteUrl: string;
}

export interface Mail {
  // A locale or Accept-Language value; English when none matches.
  locale?: string | null | undefined;
  message: Message;
  to: string;
}

export const createMailer = ({ apiKey, from, siteUrl }: MailerConfig) => {
  const resend =
    apiKey === undefined || apiKey === "" ? undefined : new Resend(apiKey);
  return async ({ locale, message, to }: Mail) => {
    const { element, subject } = compose(
      { ...message, url: new URL(message.url, siteUrl).href },
      pickLocale(locale),
      siteUrl
    );
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    if (resend === undefined) {
      log.info({ email: { kind: message.kind, subject, text, to } });
      return;
    }
    const { error } = await resend.emails.send({
      from,
      html,
      subject,
      text,
      to,
    });
    if (error !== null) {
      throw ResendFailed({ kind: message.kind, why: error.message });
    }
  };
};

export type Mailer = ReturnType<typeof createMailer>;
