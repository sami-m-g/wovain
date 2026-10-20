import { requireMcpAuth } from "@better-auth/mcp";
import { eq, user } from "@wovain-foss/db";
import { createMcpFetch } from "@wovain-foss/server";

import { isAllowed, siteUrl } from "../../lib/env.ts";
import { auth, authEnv, env, storage } from "../../lib/server.ts";

const mcpFetch = createMcpFetch(env, storage);

const scopesOf = (claim: unknown) =>
  typeof claim === "string" ? claim.split(" ").filter(Boolean) : [];

// Checked on every call, not only at sign-in, so taking an email off the
// allowlist cuts off tokens that were already issued.
const allowedUser = async (userId: string) => {
  const [row] = await storage.db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  return isAllowed(authEnv, row);
};

// Only requests with an access token issued for this URL reach the tools;
// others get a 401 that points ChatGPT at the sign-in flow.
const handle = requireMcpAuth(
  auth,
  async (request, claims) => {
    const userId = claims.sub ?? "";
    if (!(await allowedUser(userId))) {
      return new Response("This account isn't allowed to use wovain.", {
        status: 403,
      });
    }
    return await mcpFetch(request, {
      clientId: typeof claims["azp"] === "string" ? claims["azp"] : "",
      scopes: scopesOf(claims["scope"]),
      token:
        request.headers.get("authorization")?.replace(/^Bearer /u, "") ?? "",
      userId,
    });
  },
  { resource: `${siteUrl(authEnv)}/mcp` }
);

export const DELETE = handle;
export const GET = handle;
export const POST = handle;
