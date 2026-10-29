import { emailOptOut } from "@wovain/db/schema/seller";
import { pickLocale } from "@wovain/email/emails";
import type { Locale } from "@wovain/email/locales";
import { verifyUnsubscribeToken } from "@wovain/email/unsubscribe";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ENV } from "@/env.server";
import { withEvlog } from "@/lib/evlog";
import { db } from "@/services";

// The one-click unsubscribe of wovain's non-essential email (run updates),
// RFC 8058: a mail client POSTs `List-Unsubscribe=One-Click` to the link in
// the List-Unsubscribe header. A person who opens the link gets a page with a
// button (GET changes nothing, so a link scanner can't unsubscribe anyone).
// Verification and reset email is essential and has no such link.

const BAD_REQUEST = 400;

interface Text {
  button: string;
  done: string;
  invalid: string;
  prompt: string;
}

const TEXT: Record<Locale, Text> = {
  en: {
    button: "Unsubscribe",
    done: "You're unsubscribed. wovain won't email you about runs anymore.",
    invalid: "This unsubscribe link isn't valid.",
    prompt: "Stop emails about your runs?",
  },
  es: {
    button: "Cancelar suscripción",
    done: "Listo. wovain ya no te enviará correos sobre tus ejecuciones.",
    invalid: "Este enlace para cancelar no es válido.",
    prompt: "¿Dejar de recibir correos sobre tus ejecuciones?",
  },
  fr: {
    button: "Se désabonner",
    done: "Vous êtes désabonné. wovain ne vous écrira plus au sujet de vos exécutions.",
    invalid: "Ce lien de désabonnement n'est pas valide.",
    prompt: "Ne plus recevoir d'e-mails sur vos exécutions ?",
  },
};

const page = (
  request: Request,
  body: (text: Text) => ReactNode,
  status = 200
) => {
  const locale = pickLocale(request.headers.get("accept-language"));
  const html = renderToStaticMarkup(
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width" name="viewport" />
        <meta content="noindex" name="robots" />
        <title>wovain</title>
      </head>
      <body
        style={{
          fontFamily: "sans-serif",
          margin: "4rem auto",
          maxWidth: "32rem",
          padding: "0 1rem",
        }}
      >
        {body(TEXT[locale])}
      </body>
    </html>
  );
  return new Response(`<!doctype html>${html}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
    status,
  });
};

const addressOf = (request: Request) => {
  const token = new URL(request.url).searchParams.get("token");
  return token === null
    ? undefined
    : verifyUnsubscribeToken(ENV.BETTER_AUTH_SECRET, token);
};

const handleGet = (request: Request) => {
  if (addressOf(request) === undefined) {
    return page(request, (text) => <p>{text.invalid}</p>, BAD_REQUEST);
  }
  const { search } = new URL(request.url);
  return page(request, (text) => (
    <>
      <p>{text.prompt}</p>
      <form action={`/api/unsubscribe${search}`} method="post">
        <button type="submit">{text.button}</button>
      </form>
    </>
  ));
};

const handlePost = async (request: Request) => {
  const email = addressOf(request);
  if (email === undefined) {
    return page(request, (text) => <p>{text.invalid}</p>, BAD_REQUEST);
  }
  await db.insert(emailOptOut).values({ email }).onConflictDoNothing();
  return page(request, (text) => <p>{text.done}</p>);
};

export const GET = withEvlog(handleGet);
export const POST = withEvlog(handlePost);
