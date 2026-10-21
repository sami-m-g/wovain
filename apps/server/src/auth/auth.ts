import { WorkOS } from "@workos-inc/node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";

import { isAllowed, siteUrl } from "./env.ts";
import type { AllowCheck, AuthEnv } from "./env.ts";

// wovain is an OAuth resource server and WorkOS AuthKit is its authorization
// server: an agent registers itself there (CIMD, or DCR as a fallback), the
// merchant signs in and consents on AuthKit's pages, and /mcp checks the
// access token AuthKit issued for its URL.
export interface AuthDeps {
  findUser: (userId: string) => Promise<AllowCheck | null>;
  keys: JWTVerifyGetKey;
}

// Off (every /mcp call gets a 401) until both WorkOS keys are set.
const workosDeps = (
  env: AuthEnv,
  issuer: string | undefined
): AuthDeps | undefined => {
  if (issuer === undefined || env.WORKOS_API_KEY === undefined) {
    return undefined;
  }
  const workos = new WorkOS(env.WORKOS_API_KEY);
  return {
    findUser: async (userId) =>
      await workos.userManagement.getUser(userId).catch(() => null),
    keys: createRemoteJWKSet(new URL("/oauth2/jwks", issuer)),
  };
};

export interface Caller {
  claims: JWTPayload;
  token: string;
  userId: string;
}

export const createAuth = (env: AuthEnv, deps?: AuthDeps) => {
  const site = siteUrl(env);
  const resource = `${site}/mcp`;
  const issuer = env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/u, "");
  const resolved = deps ?? workosDeps(env, issuer);

  // RFC 9728: where agents learn that AuthKit signs them in for /mcp.
  const metadataUrl = `${site}/.well-known/oauth-protected-resource/mcp`;
  const metadata = {
    authorization_servers: issuer === undefined ? [] : [issuer],
    bearer_methods_supported: ["header"],
    resource,
  };

  const verify = async (request: Request): Promise<Caller | null> => {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (?<token>\S+)$/u)?.groups?.["token"];
    if (token === undefined || issuer === undefined || resolved === undefined) {
      return null;
    }
    const verified = await jwtVerify(token, resolved.keys, {
      audience: resource,
      issuer,
    }).catch(() => null);
    const claims = verified?.payload;
    return claims?.sub === undefined
      ? null
      : { claims, token, userId: claims.sub };
  };

  // Checked on every call, not only at sign-in, so taking an email off the
  // allowlist cuts off tokens that were already issued.
  const allowed = async (userId: string) =>
    isAllowed(env, await resolved?.findUser(userId));

  return { allowed, metadata, metadataUrl, verify };
};

export type Auth = ReturnType<typeof createAuth>;

// Only requests with an access token issued for /mcp reach the tools; others
// get a 401 that points the agent at the sign-in flow.
export const requireMcpAuth =
  (
    auth: Auth,
    handler: (request: Request, caller: Caller) => Promise<Response> | Response
  ) =>
  async (request: Request) => {
    const caller = await auth.verify(request);
    if (caller === null) {
      return new Response("Sign in to use wovain.", {
        headers: {
          "www-authenticate": `Bearer resource_metadata="${auth.metadataUrl}"`,
        },
        status: 401,
      });
    }
    if (!(await auth.allowed(caller.userId))) {
      return new Response("This account isn't allowed to use wovain.", {
        status: 403,
      });
    }
    return await handler(request, caller);
  };
