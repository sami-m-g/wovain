import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp } from "@better-auth/mcp";
import type { Scope } from "@better-auth/oauth-provider";
import { polar as polarAuth, webhooks } from "@polar-sh/better-auth";
import type { PolarCore } from "@polar-sh/sdk/2026-10";
import type { BillingAnalytics, BillingEvent } from "@wovain/billing/analytics";
import { handlePolarEvent } from "@wovain/billing/webhooks";
import type { Database } from "@wovain/db";
import * as schema from "@wovain/db/schema/auth";
import { pickLocale } from "@wovain/email/emails";
import type { Mail, Mailer } from "@wovain/email/mailer";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { log } from "evlog";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  // The public MCP endpoint, when it lives on another host than the app
  // (https://mcp.wovain.com/api/mcp in production).
  MCP_URL?: string | undefined;
  // Google sign-in; the provider is off unless both are set.
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  // Signs Polar's webhooks (Standard Webhooks).
  POLAR_WEBHOOK_SECRET?: string | undefined;
}

// Google redirects back to <BETTER_AUTH_URL>/api/auth/callback/google. Better
// Auth marks a Google account's email verified from Google's own claim, which
// is what the spend guard reads.
export const socialProviders = (
  env: Pick<AuthConfig, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">
) =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

const MCP_SCOPES: Scope[] = ["openid", "profile", "email", "offline_access"];

// The MCP endpoint ChatGPT connects to: access tokens are bound to it.
export const mcpResource = (env: AuthConfig) =>
  env.MCP_URL ?? `${env.BETTER_AUTH_URL}/api/mcp`;

// The app's origin, plus the MCP host's when it differs.
const trustedOrigins = (env: AuthConfig) => [
  ...new Set([env.BETTER_AUTH_URL, new URL(mcpResource(env)).origin]),
];

// The merchant's language for an email: the one saved on their account,
// else the browser's.
const localeOf = (user: object, request?: Request) =>
  "locale" in user && typeof user.locale === "string"
    ? user.locale
    : request?.headers.get("accept-language");

// Product analytics (PostHog in apps/web), keyed by user id and never the
// email; absent when the app has no PostHog key.
// Polar's webhooks add billing's revenue events and the `plan` person
// property (packages/billing/src/analytics.ts).
export interface AuthAnalytics {
  capture: (event: {
    distinctId: string;
    event: BillingEvent | "sign_up";
    properties?: Record<string, unknown>;
  }) => Promise<void>;
  identify?: BillingAnalytics["identify"];
}

// How a new user signed up, read from the endpoint that created them:
// email and password, or the OAuth provider's callback (/callback/google).
const signUpMethod = (context: GenericEndpointContext | null) => {
  if (context?.path === "/sign-up/email") {
    return "email";
  }
  const provider: unknown = context?.params?.["id"];
  return context?.path === "/callback/:id" && typeof provider === "string"
    ? provider
    : undefined;
};

// Polar, wovain's own billing: the plugin makes each new user a Polar
// customer and receives Polar's webhooks at /api/auth/polar/webhooks, checking
// their signature; the handlers mirror plans and credits into Postgres
// (packages/billing). Off unless both the token and the webhook secret are set.
const polarPlugin = (
  env: AuthConfig,
  database: Database,
  polar: PolarCore | undefined,
  analytics: AuthAnalytics | undefined
): BetterAuthPlugin[] =>
  polar === undefined ||
  env.POLAR_WEBHOOK_SECRET === undefined ||
  env.POLAR_WEBHOOK_SECRET === ""
    ? []
    : [
        polarAuth({
          client: polar,
          createCustomerOnSignUp: true,
          use: [
            webhooks({
              onPayload: async (payload) => {
                await handlePolarEvent(
                  {
                    analytics,
                    db: database,
                    log: { set: (fields) => log.info(fields) },
                    polar,
                  },
                  payload
                );
              },
              secret: env.POLAR_WEBHOOK_SECRET,
            }),
          ],
        }),
      ];

export const createAuth = (
  env: AuthConfig,
  database: Database,
  mailer: Mailer,
  analytics?: AuthAnalytics,
  polar?: PolarCore
) => {
  // Better Auth sends these in the background, so response timing doesn't
  // reveal whether an account exists; a failed send is logged, not thrown.
  const send = async (mail: Mail) => {
    try {
      await mailer(mail);
    } catch (error) {
      log.error({
        email: { kind: mail.message.kind },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return betterAuth({
    // A Google sign-in joins the account with the same email, but only when
    // Google reports that email as verified (Better Auth's default; no
    // trustedProviders, which would skip that check).
    account: { accountLinking: { enabled: true } },
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    // Saves the browser's language as the merchant's locale at sign-up, and
    // sends sign_up for every new user, whichever way they signed up (email,
    // Google, also from ChatGPT's authorization).
    databaseHooks: {
      user: {
        create: {
          // Awaited, so the event is sent before the sign-up answers.
          after: async (user, context) => {
            const method = signUpMethod(context);
            await analytics?.capture({
              distinctId: user.id,
              event: "sign_up",
              properties: method === undefined ? {} : { method },
            });
          },
          before: (user, context) =>
            Promise.resolve({
              data: {
                ...user,
                locale: pickLocale(
                  localeOf(user) ?? context?.headers?.get("accept-language")
                ),
              },
            }),
        },
      },
    },
    // The JWT plugin's /token clashes with the OAuth token endpoint.
    disabledPaths: ["/token"],
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ url, user }, request) => {
        await send({
          locale: localeOf(user, request),
          message: { kind: "reset", url },
          to: user.email,
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ url, user }, request) => {
        await send({
          locale: localeOf(user, request),
          message: { kind: "verify", url },
          to: user.email,
        });
      },
    },
    plugins: [
      // Signs the access tokens the MCP route verifies against /jwks.
      jwt(),
      // wovain as the OAuth 2.1 authorization server for MCP clients such as
      // ChatGPT. ChatGPT registers itself dynamically, so DCR stays on next
      // to client metadata documents.
      mcp({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        consentPage: "/consent",
        loginPage: "/login",
        resource: mcpResource(env),
        scopes: MCP_SCOPES,
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      }),
      ...polarPlugin(env, database, polar, analytics),
      nextCookies(),
    ],
    // On in every environment and kept in Postgres, so each Cloud Run
    // instance counts the same requests, per client IP. ChatGPT registers
    // from shared egress IPs, so client registration keeps a per-minute rule.
    rateLimit: {
      customRules: {
        "/oauth2/register": { max: 5, window: 60 },
        // Polar delivers bursts from a few IPs; the signature guards it.
        "/polar/webhooks": false,
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-up/email": { max: 10, window: 60 * 60 },
      },
      enabled: true,
      storage: "database",
    },
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: socialProviders(env),
    trustedOrigins: trustedOrigins(env),
    user: {
      additionalFields: {
        // en, fr or es: the language of the merchant's emails.
        locale: { input: true, required: false, type: "string" },
      },
    },
  });
};

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
