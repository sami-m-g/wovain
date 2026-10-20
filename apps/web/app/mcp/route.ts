import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpFetch } from "@wovain-foss/server";

import { siteUrl, loadAuthEnv } from "../../lib/env.ts";
import { auth, env, storage } from "../../lib/server.ts";

const mcpFetch = createMcpFetch(env, storage);

const scopesOf = (claim: unknown) =>
  typeof claim === "string" ? claim.split(" ").filter(Boolean) : [];

// Only requests with an access token issued for this URL reach the tools;
// others get a 401 that points ChatGPT at the sign-in flow.
const handle = requireMcpAuth(
  auth,
  async (request, claims) =>
    await mcpFetch(request, {
      clientId: typeof claims["azp"] === "string" ? claims["azp"] : "",
      scopes: scopesOf(claims["scope"]),
      token:
        request.headers.get("authorization")?.replace(/^Bearer /u, "") ?? "",
      userId: claims.sub ?? "",
    }),
  { resource: `${siteUrl(loadAuthEnv())}/mcp` }
);

export const DELETE = handle;
export const GET = handle;
export const POST = handle;
