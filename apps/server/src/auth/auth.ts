import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";

import type { Db } from "../db/client.ts";
import { schema } from "../db/schema.ts";
import { isAllowed, siteUrl } from "./env.ts";
import type { AllowCheck, AuthEnv } from "./env.ts";

// wovain is the OAuth server for the agents that connect to /mcp: an agent
// registers itself (CIMD, or DCR as a fallback), sends the merchant to
// /sign-in and /consent, then calls /mcp with a token bound to that URL.
export const createAuth = (env: AuthEnv, db: Db) => {
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
  const allowed = (user: AllowCheck | null | undefined) => isAllowed(env, user);
  return betterAuth({
    baseURL,
    // Its tables live in src/db beside wovain's records.
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Sign-in is closed to anyone off the allowlist (env.ts explains why):
    // no account is created for them, and a removed user gets no new session.
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            const user = await ctx?.context.internalAdapter.findUserById(
              session.userId
            );
            return allowed(user);
          },
        },
      },
      user: {
        create: {
          before: async (user) => await Promise.resolve(allowed(user)),
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
    ],
    ...(env.BETTER_AUTH_SECRET === undefined
      ? {}
      : { secret: env.BETTER_AUTH_SECRET }),
    socialProviders: google,
    telemetry: { enabled: false },
  });
};

export type Auth = ReturnType<typeof createAuth>;
