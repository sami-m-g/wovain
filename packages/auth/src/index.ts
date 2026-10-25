import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp } from "@better-auth/mcp";
import type { Scope } from "@better-auth/oauth-provider";
import type { Database } from "@wovain/db";
import * as schema from "@wovain/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
}

const MCP_SCOPES: Scope[] = ["openid", "profile", "email", "offline_access"];

// The MCP endpoint ChatGPT connects to: access tokens are bound to it.
export const mcpResource = (env: AuthConfig) =>
  `${env.BETTER_AUTH_URL}/api/mcp`;

export const createAuth = (env: AuthConfig, database: Database) =>
  betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    // The JWT plugin's /token clashes with the OAuth token endpoint.
    disabledPaths: ["/token"],
    emailAndPassword: { enabled: true },
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
  });

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
