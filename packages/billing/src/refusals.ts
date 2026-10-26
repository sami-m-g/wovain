import { createError } from "evlog";

import { CREDIT_PACK, PLANS } from "./plans";

// Why a paid step can't run, worded for the merchant in their language (en,
// fr or es). The web app reads `code` to show the upgrade screen.

export type Refusal = "email_not_verified" | "out_of_credits" | "plan_required";

interface Copy {
  fix: string;
  message: string;
}

type Words = Record<
  "en" | "es" | "fr",
  {
    email_not_verified: Copy;
    out_of_credits: (needed: number, available: number) => Copy;
    plan_required: Copy;
  }
>;

const { studio } = PLANS;

const COPY: Words = {
  en: {
    email_not_verified: {
      fix: "Open the link we emailed you, then try again.",
      message: "Please verify your email first",
    },
    out_of_credits: (needed, available) => ({
      fix: `Upgrade to ${studio.name} for ${studio.monthlyCredits} credits a month, or add a pack of ${CREDIT_PACK.credits}.`,
      message: `This step needs ${needed} credits and you have ${available} left`,
    }),
    plan_required: {
      fix: `Autopilot comes with ${studio.name}. Until then, run the drop yourself and approve each step.`,
      message: "Autopilot is on paid plans",
    },
  },
  es: {
    email_not_verified: {
      fix: "Abre el enlace que te enviamos por correo y vuelve a intentarlo.",
      message: "Primero verifica tu correo",
    },
    out_of_credits: (needed, available) => ({
      fix: `Pásate a ${studio.name} para tener ${studio.monthlyCredits} créditos al mes, o añade un paquete de ${CREDIT_PACK.credits}.`,
      message: `Este paso necesita ${needed} créditos y te quedan ${available}`,
    }),
    plan_required: {
      fix: `El piloto automático viene con ${studio.name}. Mientras tanto, lanza el drop tú y aprueba cada paso.`,
      message: "El piloto automático es de los planes de pago",
    },
  },
  fr: {
    email_not_verified: {
      fix: "Ouvrez le lien reçu par e-mail, puis réessayez.",
      message: "Vérifiez d'abord votre adresse e-mail",
    },
    out_of_credits: (needed, available) => ({
      fix: `Passez à ${studio.name} pour ${studio.monthlyCredits} crédits par mois, ou ajoutez un pack de ${CREDIT_PACK.credits}.`,
      message: `Cette étape demande ${needed} crédits et il vous en reste ${available}`,
    }),
    plan_required: {
      fix: `Le pilote automatique est inclus dans ${studio.name}. En attendant, lancez le drop vous-même et validez chaque étape.`,
      message: "Le pilote automatique est réservé aux offres payantes",
    },
  },
};

const STATUS: Record<Refusal, number> = {
  email_not_verified: 403,
  out_of_credits: 402,
  plan_required: 403,
};

// `data` carries what the upgrade screen shows: the credits a step needs and
// has, or the plan that unlocks it.
export const refusalError = (
  reason: Refusal,
  locale?: string | null,
  credits?: { available: number; needed: number }
) => {
  const words = locale === "es" || locale === "fr" ? COPY[locale] : COPY.en;
  const copy =
    reason === "out_of_credits"
      ? words.out_of_credits(credits?.needed ?? 0, credits?.available ?? 0)
      : words[reason];
  const data: Record<string, unknown> =
    reason === "out_of_credits"
      ? { available: credits?.available ?? 0, needed: credits?.needed ?? 0 }
      : {};
  if (reason === "plan_required") {
    data["plan"] = studio.code;
  }
  return createError({
    code: reason.toUpperCase(),
    data,
    fix: copy.fix,
    message: copy.message,
    status: STATUS[reason],
  });
};
