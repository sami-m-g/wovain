import { createError } from "evlog";

// Sign-up is open, so the paid calls (fal, Nemotron, Tavily, Qloo) are
// bounded: allowlisted emails are unlimited; everyone else gets a few runs a
// day and a few images a run, and all of them stop once today's estimated
// spend passes the cap.

export interface SpendConfig {
  SPEND_DAILY_CAP_USD: number;
  SPEND_IMAGES_PER_RUN: number;
  SPEND_RUNS_PER_DAY: number;
  WOVAIN_ALLOWED_EMAILS?: string | undefined;
}

// Estimated US dollars per paid call.
export const CALL_COST_USD = {
  fal: 0.2,
  nemotron: 0.005,
  qloo: 0.01,
  tavily: 0.008,
} as const;

// A metered step: a run's trend research, one design's art, or one more
// Nemotron call (autopilot's picks, ad copy).
export type SpendKind = "image" | "llm" | "run";

// Research asks Qloo once and Tavily twice for each of up to 3 themes; a
// design is a brief, the art and a judgment.
export const STEP_COST_USD: Record<SpendKind, number> = {
  image: CALL_COST_USD.fal + 2 * CALL_COST_USD.nemotron,
  llm: CALL_COST_USD.nemotron,
  run: CALL_COST_USD.qloo + 6 * CALL_COST_USD.tavily,
};

export const createSpendPolicy = (env: SpendConfig) => ({
  allowed: new Set(
    (env.WOVAIN_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== "")
  ),
  dailyCapUsd: env.SPEND_DAILY_CAP_USD,
  imagesPerRun: env.SPEND_IMAGES_PER_RUN,
  runsPerDay: env.SPEND_RUNS_PER_DAY,
});

export type SpendPolicy = ReturnType<typeof createSpendPolicy>;

export const isAllowlisted = (policy: SpendPolicy, email: string) =>
  policy.allowed.has(email.trim().toLowerCase());

// Midnight UTC today: quotas and the cap reset then.
export const startOfUtcDay = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export interface Usage {
  emailVerified: boolean;
  // The run's images so far, or the merchant's images today outside a run.
  images: number;
  runsToday: number;
  spentTodayUsd: number;
}

export type Refusal = "daily_limit" | "email_not_verified" | "spend_cap";

// Why a non-allowlisted merchant can't take this step now, if they can't.
export const refusal = (
  policy: SpendPolicy,
  kind: SpendKind,
  usage: Usage
): Refusal | undefined => {
  if (!usage.emailVerified) {
    return "email_not_verified";
  }
  if (usage.spentTodayUsd + STEP_COST_USD[kind] > policy.dailyCapUsd) {
    return "spend_cap";
  }
  if (kind === "run" && usage.runsToday >= policy.runsPerDay) {
    return "daily_limit";
  }
  if (kind === "image" && usage.images >= policy.imagesPerRun) {
    return "daily_limit";
  }
  return undefined;
};

type Copy = Record<Refusal, { fix: string; message: string }>;

const COPY: Record<"en" | "es" | "fr", Copy> = {
  en: {
    daily_limit: {
      fix: "Your limit resets at midnight UTC. Come back tomorrow!",
      message: "You've reached today's free limit",
    },
    email_not_verified: {
      fix: "Open the link we emailed you, then try again.",
      message: "Please verify your email first",
    },
    spend_cap: {
      fix: "Generation reopens at midnight UTC. Thanks for your patience!",
      message: "wovain has reached today's free generation budget",
    },
  },
  es: {
    daily_limit: {
      fix: "Tu límite se renueva a medianoche UTC. ¡Vuelve mañana!",
      message: "Has alcanzado el límite gratuito de hoy",
    },
    email_not_verified: {
      fix: "Abre el enlace que te enviamos por correo y vuelve a intentarlo.",
      message: "Primero verifica tu correo",
    },
    spend_cap: {
      fix: "La generación vuelve a medianoche UTC. ¡Gracias por tu paciencia!",
      message: "wovain alcanzó el presupuesto gratuito de generación de hoy",
    },
  },
  fr: {
    daily_limit: {
      fix: "Votre limite se réinitialise à minuit UTC. Revenez demain !",
      message: "Vous avez atteint la limite gratuite du jour",
    },
    email_not_verified: {
      fix: "Ouvrez le lien reçu par e-mail, puis réessayez.",
      message: "Vérifiez d'abord votre adresse e-mail",
    },
    spend_cap: {
      fix: "La génération rouvre à minuit UTC. Merci de votre patience !",
      message: "wovain a atteint son budget de génération gratuit du jour",
    },
  },
};

// The merchant-facing error, in their language (en, fr or es).
export const refusalError = (
  reason: Refusal,
  policy: SpendPolicy,
  locale?: string | null
) => {
  const copy =
    locale === "es" || locale === "fr" ? COPY[locale][reason] : COPY.en[reason];
  return createError({
    code: reason.toUpperCase(),
    fix: copy.fix,
    message: copy.message,
    status: reason === "email_not_verified" ? 403 : 429,
    ...(reason === "daily_limit"
      ? {
          why: `${policy.runsPerDay} runs a day, ${policy.imagesPerRun} images a run.`,
        }
      : {}),
  });
};
