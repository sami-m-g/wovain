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
import { decodeJwt } from "jose";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  // The public MCP endpoint, which can live on another host than the app.
  MCP_URL: string;
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
export const mcpResource = (env: Pick<AuthConfig, "MCP_URL">) => env.MCP_URL;

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
    event: BillingEvent | "sign_up" | "signed_up";
    properties?: Record<string, unknown>;
    timestamp?: Date;
  }) => Promise<void>;
  identify?: BillingAnalytics["identify"];
}

// The email and its verification in a Google ID token. The token comes
// straight from Google's token endpoint in the OAuth callback, which Better
// Auth has already validated, so it is only decoded here.
const googleVerifiedEmail = (
  idToken: string | null | undefined
): string | undefined => {
  let claims: Record<string, unknown> = {};
  try {
    claims = idToken ? decodeJwt(idToken) : {};
  } catch {
    // Not a JWT: no claims to trust.
  }
  const { email, email_verified: verified } = claims;
  return typeof email === "string" && verified === true ? email : undefined;
};

/**
 * Marks a user's email verified when a Google account joins them and Google
 * verified that same email. Better Auth already does this when Google links
 * at sign-in, but not when a signed-in merchant connects Google from Account
 * settings (linkSocial). Google isn't a trusted provider and different emails
 * can't link, so Better Auth only gets here with Google's verified claim for
 * the user's own address; the token's claims are checked again regardless.
 */
export const verifyEmailFromGoogle = async (
  account: {
    idToken?: string | null | undefined;
    providerId: string;
    userId: string;
  },
  context: GenericEndpointContext | null
): Promise<void> => {
  if (account.providerId !== "google" || context === null) {
    return;
  }
  const email = googleVerifiedEmail(account.idToken);
  if (email === undefined) {
    return;
  }
  const { internalAdapter } = context.context;
  const user = await internalAdapter.findUserById(account.userId);
  if (
    user === null ||
    user.emailVerified ||
    user.email.toLowerCase() !== email.toLowerCase()
  ) {
    return;
  }
  await internalAdapter.updateUser(user.id, { emailVerified: true });
  log.info({ auth: { emailVerifiedBy: "google", userId: user.id } });
};

const DASHBOARD = "/dashboard";

/**
 * Sends a verification link without a destination of its own to the
 * dashboard. Better Auth points it at "/" when the request named none, as a
 * password sign-in refused for an unverified email does: the sign-in can't
 * name one, since a successful sign-in would then redirect the browser and
 * cut short an OAuth authorization (ChatGPT) or a second factor.
 */
const landOnDashboard = (url: string): string => {
  const link = new URL(url);
  const callback = link.searchParams.get("callbackURL");
  if (callback !== null && callback !== "/") {
    return url;
  }
  link.searchParams.set("callbackURL", DASHBOARD);
  return link.href;
};

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
                    log: {
                      error: (fields) => log.error(fields),
                      set: (fields) => log.info(fields),
                    },
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

// An error as plain fields for the global evlog logger, which keeps what it
// is given: an Error instance would serialize as {}.
const errorFields = (error: unknown, code?: string) =>
  error instanceof Error
    ? { code, message: error.message, name: error.name, stack: error.stack }
    : { code, message: String(error), name: "Error" };

// Better Auth's own logs go through evlog instead of the console, so its
// errors (a failed sign-in handler, a database fault) are error-level events
// that reach error tracking with the Error it logged, when there is one.
export const authLogger = {
  log: (
    level: "debug" | "error" | "info" | "warn",
    message: string,
    ...args: unknown[]
  ) => {
    const error = args.find((arg) => arg instanceof Error);
    const auth = { message };
    if (level === "error") {
      log.error({
        auth,
        error: {
          ...errorFields(error ?? message),
          message:
            error === undefined ? message : `${message}: ${error.message}`,
          name: error?.name ?? "BetterAuthError",
        },
      });
    } else if (level === "warn") {
      log.warn({ auth });
    } else {
      log.info({ auth });
    }
  },
};

export const createAuth = (
  env: AuthConfig,
  database: Database,
  mailer: Mailer,
  analytics?: AuthAnalytics,
  polar?: PolarCore
) => {
  // Better Auth awaits these (no advanced.backgroundTasks), so on Cloud Run
  // the send finishes while the request still has CPU. A failed send is
  // logged as an error with the user's id, so error tracking reports it for
  // that user (apps/web/src/lib/error-tracking.ts); it is never thrown: the
  // sign-up or reset answers the same either way.
  const send = async (mail: Mail, userId: string) => {
    try {
      await mailer(mail);
    } catch (error) {
      log.error({
        email: { kind: mail.message.kind },
        error: errorFields(error, "EMAIL_SEND_FAILED"),
        userId,
      });
    }
  };
  return betterAuth({
    // A Google sign-in joins the user with the same email only when Google
    // verified that email and so did the user (Better Auth's
    // requireLocalEmailVerified, on by default): otherwise anyone could
    // pre-register a victim's address with a password and keep access once
    // the victim signs in with Google. Google stays untrusted, since
    // trustedProviders would skip Google's own email_verified check. A user
    // whose email isn't verified yet signs in with their password and
    // connects Google from Account settings, which verifies the email
    // (verifyEmailFromGoogle).
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
      account: {
        create: {
          after: (account, context) => verifyEmailFromGoogle(account, context),
        },
      },
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
            // The north star's clock starts here; user.createdAt is the
            // time the Insights page times the journey from.
            await analytics?.capture({
              distinctId: user.id,
              event: "signed_up",
              properties: {
                ...(method === undefined ? {} : { method }),
                reached_at: user.createdAt.toISOString(),
              },
              timestamp: user.createdAt,
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
    // A password account signs in only once its email is verified: sign-up
    // answers without a session and the app shows "check your email"; the
    // email's link verifies the address and signs the merchant in
    // (autoSignInAfterVerification). It also answers a taken email the same
    // way as a new one, so sign-up doesn't reveal who has an account. Google
    // accounts arrive verified by Google.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ url, user }, request) => {
        await send(
          {
            locale: localeOf(user, request),
            message: { kind: "reset", url },
            to: user.email,
          },
          user.id
        );
      },
    },
    // The link is <BETTER_AUTH_URL>/api/auth/verify-email, whatever host the
    // request came in on. A sign-in with an unverified email sends a fresh
    // link before it's refused (EMAIL_NOT_VERIFIED).
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ url, user }, request) => {
        await send(
          {
            locale: localeOf(user, request),
            message: { kind: "verify", url: landOnDashboard(url) },
            to: user.email,
          },
          user.id
        );
      },
    },
    logger: authLogger,
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
        // Each one sends an email.
        "/send-verification-email": { max: 3, window: 60 },
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
