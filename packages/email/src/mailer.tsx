import { render } from "@react-email/render";
import { defineError, log } from "evlog";
import { Resend } from "resend";

import { compose, isEssential, pickLocale } from "./emails";
import type { Message } from "./emails";
import { unsubscribeToken } from "./unsubscribe";

// Sends wovain's emails through Resend. Without RESEND_API_KEY (local
// development), each email is logged instead of sent.
//
// Deliverability follows Gmail's and Yahoo's sender requirements
// (support.google.com/a/answer/81126, senders.yahooinc.com/developer/
// documentation) and Resend's guide (resend.com/docs/knowledge-base/
// how-do-i-maximize-deliverability-for-transactional-emails): non-essential
// mail carries List-Unsubscribe and List-Unsubscribe-Post (RFC 8058) headers,
// replies reach a monitored address, and the HTML is mostly text with a
// plain-text twin. Resend tracks opens and clicks per domain, not per send:
// turn both off for transactional mail in infra/resend.ts.

const ResendFailed = defineError("RESEND_FAILED", {
  fix: "Check RESEND_API_KEY and that EMAIL_FROM's domain is verified in Resend.",
  message: ({ kind }: { kind: string }) => `Couldn't send the ${kind} email`,
  status: 502,
});

export interface MailerConfig {
  apiKey: string | undefined;
  from: string;
  // Where a reply goes; a monitored mailbox, never a no-reply address.
  replyTo: string;
  // Links given as a path ("/dashboard") point at this site.
  siteUrl: string;
  // Signs the unsubscribe link. Without it, no email carries one.
  unsubscribeSecret?: string | undefined;
}

export interface Mail {
  // A locale or Accept-Language value; English when none matches.
  locale?: string | null | undefined;
  message: Message;
  to: string;
}

// The bare address of "Name <address>" or "address".
const ADDRESS = /<(?<address>[^>]+)>/u;
const addressOf = (value: string) =>
  ADDRESS.exec(value)?.groups?.["address"] ?? value;

export const createMailer = ({
  apiKey,
  from,
  replyTo,
  siteUrl,
  unsubscribeSecret,
}: MailerConfig) => {
  const resend =
    apiKey === undefined || apiKey === "" ? undefined : new Resend(apiKey);
  return async ({ locale, message, to }: Mail) => {
    const unsubscribeUrl =
      isEssential(message) || unsubscribeSecret === undefined
        ? undefined
        : new URL(
            `/api/unsubscribe?token=${unsubscribeToken(unsubscribeSecret, to)}`,
            siteUrl
          ).href;
    const { element, subject } = compose(
      { ...message, url: new URL(message.url, siteUrl).href },
      pickLocale(locale),
      siteUrl,
      unsubscribeUrl
    );
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    if (resend === undefined) {
      log.info({ email: { kind: message.kind, subject, text, to } });
      return;
    }
    const { data, error } = await resend.emails.send({
      from,
      ...(unsubscribeUrl === undefined
        ? {}
        : {
            headers: {
              "List-Unsubscribe": `<mailto:${addressOf(replyTo)}?subject=unsubscribe>, <${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
      html,
      replyTo,
      subject,
      text,
      to,
    });
    if (error !== null) {
      throw ResendFailed({ kind: message.kind, why: error.message });
    }
    // Resend's id finds the email in its dashboard (delivered, bounced).
    log.info({ email: { id: data?.id, kind: message.kind } });
  };
};

export type Mailer = ReturnType<typeof createMailer>;
