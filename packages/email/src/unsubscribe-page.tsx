import { Body, Head, Html } from "@react-email/components";
import { render } from "@react-email/render";

import type { Locale } from "./locales";

// The page behind the unsubscribe link (apps/web/src/app/api/unsubscribe):
// a confirm button, the result, or a notice that the link is not valid.

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

export type UnsubscribeView =
  // `action` is the endpoint the button posts to, token included.
  { action: string; view: "confirm" } | { view: "done" | "invalid" };

const Page = ({
  locale,
  state,
}: {
  locale: Locale;
  state: UnsubscribeView;
}) => {
  const text = TEXT[locale];
  return (
    <Html lang={locale}>
      <Head>
        <meta charSet="utf-8" />
        <meta content="width=device-width" name="viewport" />
        <meta content="noindex" name="robots" />
        <title>wovain</title>
      </Head>
      <Body
        style={{
          fontFamily: "sans-serif",
          margin: "4rem auto",
          maxWidth: "32rem",
          padding: "0 1rem",
        }}
      >
        {state.view === "confirm" && (
          <>
            <p>{text.prompt}</p>
            <form action={state.action} method="post">
              <button type="submit">{text.button}</button>
            </form>
          </>
        )}
        {state.view === "done" && <p>{text.done}</p>}
        {state.view === "invalid" && <p>{text.invalid}</p>}
      </Body>
    </Html>
  );
};

export const unsubscribePage = (locale: Locale, state: UnsubscribeView) =>
  render(<Page locale={locale} state={state} />);
