import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

import { siteUrl } from "./env.ts";
import type { AuthEnv } from "./env.ts";

// Neon when DATABASE_URL is set (its own tables beside wovain's records),
// else a SQLite file next to the local store.
const authDatabase = (env: AuthEnv, dataDir: string) => {
  if (env.DATABASE_URL !== undefined) {
    return new Pool({ connectionString: env.DATABASE_URL });
  }
  mkdirSync(dataDir, { recursive: true });
  return new Database(path.join(dataDir, "auth.sqlite"), { create: true });
};

// wovain is ChatGPT's OAuth server (developers.openai.com/plugins/build/auth):
// ChatGPT registers itself (CIMD, or DCR as a fallback), sends the merchant to
// /sign-in and /consent, then calls /mcp with a token bound to that URL.
export const createAuth = (env: AuthEnv, dataDir: string) => {
  const baseURL = siteUrl(env);
  const google =
    env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {};
  const allowed = (email: string | null | undefined) =>
    email !== null &&
    email !== undefined &&
    env.WOVAIN_ALLOWED_EMAILS.has(email.toLowerCase());
  return betterAuth({
    baseURL,
    database: authDatabase(env, dataDir),
    // Sign-in is closed to anyone off the allowlist (env.ts explains why):
    // no account is created for them, and a removed user gets no new session.
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            const user = await ctx?.context.internalAdapter.findUserById(
              session.userId
            );
            return allowed(user?.email);
          },
        },
      },
      user: {
        create: {
          before: async (user) => await Promise.resolve(allowed(user.email)),
        },
      },
    },
    plugins: [
      jwt(),
      mcp({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        consentPage: "/consent",
        loginPage: "/sign-in",
        resource: `${baseURL}/mcp`,
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      }),
      // Last, so sign-in responses set their cookies through Next.js.
      nextCookies(),
    ],
    ...(env.BETTER_AUTH_SECRET === undefined
      ? {}
      : { secret: env.BETTER_AUTH_SECRET }),
    socialProviders: google,
    telemetry: { enabled: false },
  });
};
