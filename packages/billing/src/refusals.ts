import { createError } from "evlog";

import { billingCatalog } from "./catalog";

// Why a paid step can't run, worded for the merchant in their language (en,
// fr or es). The web app reads `code` to show the upgrade screen. While paid
// plans are off (billing-paid-plans), the copy sells nothing: Free's credits
// refresh monthly and more is coming soon.

export type Refusal = "email_not_verified" | "out_of_credits" | "plan_required";

interface Copy {
  fix: string;
  message: string;
}

type Words = Record<
  "en" | "es" | "fr",
  {
    email_not_verified: Copy;
    out_of_credits: (needed: number, available: number, paid: boolean) => Copy;
    plan_required: (paid: boolean) => Copy;
  }
>;

const studio = () => billingCatalog().plans.studio;
const packCredits = () => billingCatalog().creditPack.credits;

const COPY: Words = {
  en: {
    email_not_verified: {
      fix: "Open the link we emailed you, then try again.",
      message: "Please verify your email first",
    },
    out_of_credits: (needed, available, paid) => ({
      fix: paid
        ? `Upgrade to ${studio().name} for ${studio().monthlyCredits} credits a month, or add a pack of ${packCredits()}.`
        : "Your free credits refresh every month. More credits are coming soon.",
      message: `This step needs ${needed} credits and you have ${available} left`,
    }),
    plan_required: (paid) => ({
      fix: paid
        ? `Autopilot comes with ${studio().name}. Until then, run the drop yourself and approve each step.`
        : "Autopilot is coming soon with paid plans. Until then, run the drop yourself and approve each step.",
      message: paid ? "Autopilot is on paid plans" : "Autopilot is coming soon",
    }),
  },
  es: {
    email_not_verified: {
      fix: "Abre el enlace que te enviamos por correo y vuelve a intentarlo.",
      message: "Primero verifica tu correo",
    },
    out_of_credits: (needed, available, paid) => ({
      fix: paid
        ? `Pásate a ${studio().name} para tener ${studio().monthlyCredits} créditos al mes, o añade un paquete de ${packCredits()}.`
        : "Tus créditos gratuitos se renuevan cada mes. Pronto habrá más créditos.",
      message: `Este paso necesita ${needed} créditos y te quedan ${available}`,
    }),
    plan_required: (paid) => ({
      fix: paid
        ? `El piloto automático viene con ${studio().name}. Mientras tanto, lanza el drop tú y aprueba cada paso.`
        : "El piloto automático llegará pronto con los planes de pago. Mientras tanto, lanza el drop tú y aprueba cada paso.",
      message: paid
        ? "El piloto automático es de los planes de pago"
        : "El piloto automático llegará pronto",
    }),
  },
  fr: {
    email_not_verified: {
      fix: "Ouvrez le lien reçu par e-mail, puis réessayez.",
      message: "Vérifiez d'abord votre adresse e-mail",
    },
    out_of_credits: (needed, available, paid) => ({
      fix: paid
        ? `Passez à ${studio().name} pour ${studio().monthlyCredits} crédits par mois, ou ajoutez un pack de ${packCredits()}.`
        : "Vos crédits gratuits se renouvellent chaque mois. D'autres crédits arrivent bientôt.",
      message: `Cette étape demande ${needed} crédits et il vous en reste ${available}`,
    }),
    plan_required: (paid) => ({
      fix: paid
        ? `Le pilote automatique est inclus dans ${studio().name}. En attendant, lancez le drop vous-même et validez chaque étape.`
        : "Le pilote automatique arrive bientôt avec les offres payantes. En attendant, lancez le drop vous-même et validez chaque étape.",
      message: paid
        ? "Le pilote automatique est réservé aux offres payantes"
        : "Le pilote automatique arrive bientôt",
    }),
  },
};

const STATUS: Record<Refusal, number> = {
  email_not_verified: 403,
  out_of_credits: 402,
  plan_required: 403,
};

const copyFor = (
  words: Words["en"],
  reason: Refusal,
  credits: { available: number; needed: number },
  paid: boolean
) => {
  if (reason === "out_of_credits") {
    return words.out_of_credits(credits.needed, credits.available, paid);
  }
  return reason === "plan_required"
    ? words.plan_required(paid)
    : words.email_not_verified;
};

// `data` carries what the upgrade screen shows: the credits a step needs and
// has, the plan that unlocks it, and whether paid plans are on sale.
export const refusalError = (
  reason: Refusal,
  locale?: string | null,
  {
    available = 0,
    needed = 0,
    paid = false,
  }: { available?: number; needed?: number; paid?: boolean } = {}
) => {
  const words = locale === "es" || locale === "fr" ? COPY[locale] : COPY.en;
  const copy = copyFor(words, reason, { available, needed }, paid);
  const data: Record<string, unknown> =
    reason === "out_of_credits" ? { available, needed, paidPlans: paid } : {};
  if (reason === "plan_required") {
    data["plan"] = studio().code;
    data["paidPlans"] = paid;
  }
  return createError({
    code: reason.toUpperCase(),
    data,
    fix: copy.fix,
    message: copy.message,
    status: STATUS[reason],
  });
};
