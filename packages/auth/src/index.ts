import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp } from "@better-auth/mcp";
import type { Scope } from "@better-auth/oauth-provider";
import type { Database } from "@wovain/db";
import * as schema from "@wovain/db/schema/auth";
import { pickLocale } from "@wovain/email/emails";
import type { Mail, Mailer } from "@wovain/email/mailer";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { log } from "evlog";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
}

const MCP_SCOPES: Scope[] = ["openid", "profile", "email", "offline_access"];

// The MCP endpoint ChatGPT connects to: access tokens are bound to it.
export const mcpResource = (env: AuthConfig) =>
  `${env.BETTER_AUTH_URL}/api/mcp`;

// The merchant's language for an email: the one saved on their account,
// else the browser's.
const localeOf = (user: object, request?: Request) =>
  "locale" in user && typeof user.locale === "string"
    ? user.locale
    : request?.headers.get("accept-language");

export const createAuth = (
  env: AuthConfig,
  database: Database,
  mailer: Mailer
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
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    // Saves the browser's language as the merchant's locale at sign-up.
    databaseHooks: {
      user: {
        create: {
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
      nextCookies(),
    ],
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    user: {
      additionalFields: {
        // en, fr or es: the language of the merchant's emails.
        locale: { input: true, required: false, type: "string" },
      },
    },
  });
};

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
