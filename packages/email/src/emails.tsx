import { match } from "@formatjs/intl-localematcher";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import type { RunStatus as RunState } from "@wovain/db/schema/seller";
import Negotiator from "negotiator";

import { locales } from "./locales";
import type { Locale } from "./locales";

// wovain's transactional emails: one layout, with copy in each locale the
// site speaks.

const isLocale = (value: string): value is Locale =>
  locales.some((locale) => locale === value);

// The supported language a locale or Accept-Language value prefers most, by
// q-value; English when none matches.
export const pickLocale = (value?: string | null): Locale => {
  const preferred = new Negotiator({
    headers: { "accept-language": value ?? "" },
  }).languages(locales);
  const picked = match(preferred, locales, "en");
  return isLocale(picked) ? picked : "en";
};

// The statuses a run emails the merchant about: every one but "running".
type RunStatus = Exclude<RunState, "running">;

// Verification and reset email is essential: it carries no unsubscribe link.
export const isEssential = (message: Message) => message.kind !== "run";

export type Message =
  | { kind: "reset" | "verify"; url: string }
  | { kind: "run"; seed: string; status: RunStatus; url: string };

interface Copy {
  action: string;
  body: string;
  heading: string;
}

const COPY: Record<
  Locale,
  {
    ignore: string;
    // Before the link as plain text, for a mail client that blocks buttons.
    paste: string;
    reset: Copy;
    unsubscribe: string;
    run: Record<RunStatus, (seed: string) => Copy>;
    verify: Copy;
  }
> = {
  en: {
    ignore: "If you didn't ask for this, you can ignore this email.",
    paste: "If the button doesn't work, open this link:",
    reset: {
      action: "Reset password",
      body: "Choose a new password for your wovain account. The link works for one hour.",
      heading: "Reset your password",
    },
    run: {
      awaiting_approval: (seed) => ({
        action: "Review the design",
        body: `wovain designed a product from "${seed}". Approve or reject it to continue.`,
        heading: "A design needs your approval",
      }),
      completed: (seed) => ({
        action: "See the run",
        body: `Your "${seed}" run is done: the product is published and its campaign is staged, paused.`,
        heading: "Your run is finished",
      }),
      failed: (seed) => ({
        action: "See what happened",
        body: `Your "${seed}" run stopped before the end.`,
        heading: "Your run stopped",
      }),
    },
    unsubscribe: "Unsubscribe from run updates",
    verify: {
      action: "Verify email",
      body: "Confirm this address to finish setting up your wovain account.",
      heading: "Verify your email",
    },
  },
  es: {
    ignore: "Si no lo pediste, puedes ignorar este correo.",
    paste: "Si el botón no funciona, abre este enlace:",
    reset: {
      action: "Restablecer contraseña",
      body: "Elige una nueva contraseña para tu cuenta de wovain. El enlace es válido durante una hora.",
      heading: "Restablece tu contraseña",
    },
    run: {
      awaiting_approval: (seed) => ({
        action: "Revisar el diseño",
        body: `wovain diseñó un producto a partir de "${seed}". Apruébalo o recházalo para continuar.`,
        heading: "Un diseño necesita tu aprobación",
      }),
      completed: (seed) => ({
        action: "Ver la ejecución",
        body: `Tu ejecución "${seed}" terminó: el producto está publicado y su campaña está preparada, en pausa.`,
        heading: "Tu ejecución terminó",
      }),
      failed: (seed) => ({
        action: "Ver qué pasó",
        body: `Tu ejecución "${seed}" se detuvo antes de terminar.`,
        heading: "Tu ejecución se detuvo",
      }),
    },
    unsubscribe: "Cancelar las notificaciones de ejecuciones",
    verify: {
      action: "Verificar correo",
      body: "Confirma esta dirección para terminar de configurar tu cuenta de wovain.",
      heading: "Verifica tu correo",
    },
  },
  fr: {
    ignore:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    paste: "Si le bouton ne fonctionne pas, ouvrez ce lien :",
    reset: {
      action: "Réinitialiser le mot de passe",
      body: "Choisissez un nouveau mot de passe pour votre compte wovain. Le lien est valable une heure.",
      heading: "Réinitialisez votre mot de passe",
    },
    run: {
      awaiting_approval: (seed) => ({
        action: "Voir le design",
        body: `wovain a conçu un produit à partir de « ${seed} ». Approuvez-le ou refusez-le pour continuer.`,
        heading: "Un design attend votre validation",
      }),
      completed: (seed) => ({
        action: "Voir l'exécution",
        body: `Votre exécution « ${seed} » est terminée : le produit est publié et sa campagne est prête, en pause.`,
        heading: "Votre exécution est terminée",
      }),
      failed: (seed) => ({
        action: "Voir ce qui s'est passé",
        body: `Votre exécution « ${seed} » s'est arrêtée avant la fin.`,
        heading: "Votre exécution s'est arrêtée",
      }),
    },
    unsubscribe: "Se désabonner des notifications d'exécution",
    verify: {
      action: "Vérifier l'e-mail",
      body: "Confirmez cette adresse pour finir de configurer votre compte wovain.",
      heading: "Vérifiez votre e-mail",
    },
  },
};

// The brand: cochineal, plum ink and calico (apps/web/src/brand/brand.tsx).
const BRAND = {
  accent: "#b0245f",
  ink: "#3b1530",
  muted: "#6b5462",
  paper: "#f7f1e8",
};
// public/brand/email-logo.png: the Shuttle lockup (light) at 2x, 180 x 40 CSS pixels.
const LOGO = { height: 40, path: "/brand/email-logo.png", width: 180 };

const Layout = ({
  copy,
  footer,
  locale,
  logoUrl,
  paste,
  unsubscribe,
  url,
}: {
  copy: Copy;
  footer: string | undefined;
  locale: Locale;
  logoUrl: string | undefined;
  paste: string;
  unsubscribe: { label: string; url: string } | undefined;
  url: string;
}) => (
  <Html lang={locale}>
    <Head />
    <Preview>{copy.heading}</Preview>
    <Body
      style={{
        backgroundColor: BRAND.paper,
        color: BRAND.ink,
        fontFamily: "sans-serif",
      }}
    >
      <Container style={{ maxWidth: 480, padding: 24 }}>
        {logoUrl === undefined ? null : (
          <Img
            alt="wovain"
            height={LOGO.height}
            src={logoUrl}
            style={{ marginBottom: 24 }}
            width={LOGO.width}
          />
        )}
        <Heading as="h1" style={{ fontSize: 22 }}>
          {copy.heading}
        </Heading>
        <Text>{copy.body}</Text>
        <Button
          href={url}
          style={{
            backgroundColor: BRAND.accent,
            borderRadius: 10,
            color: "#ffffff",
            padding: "10px 16px",
          }}
        >
          {copy.action}
        </Button>
        <Text style={{ color: BRAND.muted, fontSize: 12 }}>
          {paste} <Link href={url}>{url}</Link>
        </Text>
        {footer !== undefined && (
          <Text style={{ color: BRAND.muted, fontSize: 12 }}>{footer}</Text>
        )}
        {unsubscribe === undefined ? null : (
          <Text style={{ color: BRAND.muted, fontSize: 12 }}>
            <Link href={unsubscribe.url}>{unsubscribe.label}</Link>
          </Text>
        )}
      </Container>
    </Body>
  </Html>
);

// The subject and the email itself, in the merchant's locale.
// `siteUrl` makes the logo header absolute; without it the email has no logo.
// `unsubscribeUrl` adds the unsubscribe link to a non-essential email.
export const compose = (
  message: Message,
  locale: Locale,
  siteUrl?: string,
  unsubscribeUrl?: string
) => {
  const copy = COPY[locale];
  const content =
    message.kind === "run"
      ? copy.run[message.status](message.seed)
      : copy[message.kind];
  return {
    element: (
      <Layout
        copy={content}
        footer={message.kind === "run" ? undefined : copy.ignore}
        locale={locale}
        logoUrl={
          siteUrl === undefined ? undefined : new URL(LOGO.path, siteUrl).href
        }
        paste={copy.paste}
        unsubscribe={
          unsubscribeUrl === undefined
            ? undefined
            : { label: copy.unsubscribe, url: unsubscribeUrl }
        }
        url={message.url}
      />
    ),
    subject: content.heading,
  };
};
