// apps/web's settings and secrets as each stack hands them to its service
// and its GitHub environment's image build: production and dev in the
// `wovain` project (index.ts), next.wovain.com in `wovain-next` (next/).
import * as pulumi from "@pulumi/pulumi";

import { ResendApiKey } from "./resend.ts";

interface Env {
  name: string;
  value: pulumi.Input<string>;
}

// The stack config key of a setting: production's plain, another
// environment's in the same stack `<key>-<name>` (`emailFrom-dev`).
export type SettingKey = (base: string) => string;

// Settings every environment of a stack shares. NEMOTRON_MODEL is the Nebius
// model the agents call (`pulumi config set nemotronModel <id>`) and
// FAL_IMAGE_MODEL the fal endpoint that draws (`falImageModel`).
// Production still calls Graph v24.0; next and dev pass v26.0.
export const PRODUCTION_GRAPH_VERSION = "v24.0";
export const sharedSettings = (
  config: pulumi.Config,
  graphVersion: string = PRODUCTION_GRAPH_VERSION
) => ({
  FAL_IMAGE_MODEL: config.require("falImageModel"),
  // Meta's interest search for Qloo audience targeting
  // (packages/core/src/meta-interests.ts).
  META_GRAPH_URL: `https://graph.facebook.com/${graphVersion}`,
  NEBIUS_BASE_URL: "https://api.tokenfactory.nebius.com/v1/",
  NEMOTRON_MODEL: config.require("nemotronModel"),
  NEMOTRON_VISION_MODEL: config.require("nemotronVisionModel"),
  QLOO_API_URL: "https://hackathon.api.qloo.com",
});

// apps/web's per-environment settings (apps/web/.env.schema gives none a
// default), from the stack's config. The JSON ones are objects. Each
// service gets them at runtime and each GitHub environment's image build
// through its WEB_BUILD_ENV variable.
export const appSettings = (config: pulumi.Config, key: SettingKey) => {
  const plain = Object.fromEntries(
    Object.entries({
      DOCS_URL: "docsUrl",
      EMAIL_FROM: "emailFrom",
      FAL_MCP_URL: "falMcpUrl",
      FOURTHWALL_DEFAULT_PRODUCT_ID: "fourthwallDefaultProductId",
      FOURTHWALL_MCP_URL: "fourthwallMcpUrl",
      GUARDRAIL_INJECTION_THRESHOLD: "guardrailInjectionThreshold",
      GUARDRAIL_MODERATION_THRESHOLD: "guardrailModerationThreshold",
      GUARDRAIL_PII_THRESHOLD: "guardrailPiiThreshold",
      META_MCP_SCOPE: "metaMcpScope",
      META_MCP_URL: "metaMcpUrl",
      NEMOTRON_INPUT_PRICE: "nemotronInputPrice",
      // The Nemotron model per job (packages/core/src/model-router.ts).
      NEMOTRON_MODEL_DEFAULT: "nemotronModelDefault",
      NEMOTRON_MODEL_FAST: "nemotronModelFast",
      NEMOTRON_MODEL_REASONING: "nemotronModelReasoning",
      NEMOTRON_MODEL_SAFETY: "nemotronModelSafety",
      NEMOTRON_MODEL_VISION: "nemotronModelVision",
      NEMOTRON_OUTPUT_PRICE: "nemotronOutputPrice",
      PRIVACY_EMAIL: "privacyEmail",
      SUPPORT_EMAIL: "supportEmail",
      // Tavily Research's model for idea dossiers (packages/core/src/evidence.ts).
      TAVILY_RESEARCH_MODEL: "tavilyResearchModel",
      // Voice commands' fal speech-to-text endpoints
      // (packages/core/src/voice.ts).
      VOICE_STT_FALLBACK_MODEL: "voiceSttFallbackModel",
      VOICE_STT_MODEL: "voiceSttModel",
    }).map(([env, base]) => [env, config.require(key(base))])
  );
  return {
    ...plain,
    BILLING_CATALOG: JSON.stringify(
      config.requireObject(key("billingCatalog"))
    ),
    // A drop's fal models per art type (packages/core/src/art.ts).
    FAL_ART_MODELS: JSON.stringify(config.requireObject(key("falArtModels"))),
    MCP_WIDGET_RESOURCE_DOMAINS: config
      .requireObject<string[]>(key("mcpWidgetResourceDomains"))
      .join(","),
    PRICING_RULES: JSON.stringify(config.requireObject(key("pricingRules"))),
  } as Record<string, string>;
};

export const settingEnvs = (settings: Record<string, string>): Env[] =>
  Object.entries(settings).map(([name, value]) => ({ name, value }));

// An image build's env file (.github/workflows/deploy.yml): Varlock reads
// backquoted values as is, apart from escapes, so none may hold a backquote
// or a backslash.
export const buildEnv = (settings: Record<string, string>, mcp: string) =>
  Object.entries({ ...settings, MCP_URL: mcp })
    .map(([name, value]) => {
      if (/[`\\]/u.test(value)) {
        throw new Error(`${name} can't hold a backquote or a backslash`);
      }
      return `${name}=\`${value}\``;
    })
    .join("\n");

// The provider secrets every non-production environment holds its own of
// (`<id>-<name>` in Secret Manager, dev.ts), never production's. fal-key is
// wovain's own fal key: voice commands transcribe on it, and designs draw
// on it while the onboarding-wizard flag is on (`fal-key-next`);
// wovain-allowed-emails is no longer read.
// infra/README.md lists where each value comes from.
const ENVIRONMENT_SECRET_IDS = [
  "fal-key",
  "google-client-secret",
  "inngest-event-key",
  "inngest-signing-key",
  "meta-app-id",
  "meta-app-secret",
  "nebius-api-key",
  "polar-access-token",
  "polar-webhook-secret",
  "posthog-secret-key",
  "qloo-api-key",
  "resend-api-key",
  "tavily-api-key",
  "telegram-bot-token",
] as const;

// Production's Resend domain and full-access key, with which Pulumi makes an
// environment its own sending-only key for the same domain (resend.ts).
interface ResendAdmin {
  apiKey: pulumi.Input<string>;
  domainId: pulumi.Input<string>;
}

// An environment's provider secret values, each from its stack secret
// (`key(id)`), except Resend's key, which Pulumi creates.
export const environmentSecrets = (
  config: pulumi.Config,
  key: SettingKey,
  name: string,
  resend: ResendAdmin | undefined
) => {
  const values: Record<string, pulumi.Input<string> | undefined> =
    Object.fromEntries(
      ENVIRONMENT_SECRET_IDS.map((id) => [id, config.getSecret(key(id))])
    );
  // As production's: a placeholder until `pnpm polar:seed` writes the
  // endpoint's secret (POLAR_WEBHOOK_SECRET_ID=polar-webhook-secret-<name>).
  if (values["polar-access-token"] !== undefined) {
    values["polar-webhook-secret"] ??= pulumi.output("pending-polar-seed");
  }
  if (resend !== undefined) {
    values["resend-api-key"] ??= new ResendApiKey(`resend-${name}`, {
      apiKey: resend.apiKey,
      domainId: resend.domainId,
      name: `wovain ${name}`,
    }).token;
  }
  return values;
};

// An environment's plain settings: the shared provider URLs; its APP_ENV
// and Inngest app id; its own PostHog project's token; and its own Google
// OAuth client next to its google-client-secret, without which the Google
// button is hidden.
export const environmentEnvs = (args: {
  appEnv: "development" | "next";
  googleClientId: string | undefined;
  name: string;
  posthogToken: pulumi.Input<string>;
  shared: Record<string, string>;
}): Env[] => [
  ...Object.entries(args.shared).map(([name, value]) => ({ name, value })),
  { name: "APP_ENV", value: args.appEnv },
  { name: "INNGEST_APP_ID", value: `wovain-${args.name}` },
  { name: "NEXT_PUBLIC_POSTHOG_KEY", value: args.posthogToken },
  ...(args.googleClientId === undefined
    ? []
    : [{ name: "GOOGLE_CLIENT_ID", value: args.googleClientId }]),
];
