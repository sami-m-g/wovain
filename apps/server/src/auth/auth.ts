import {
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { NotFoundException, WorkOS } from "@workos-inc/node";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

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

// An outage at WorkOS or AuthKit answers 500. Only the error's class and
// status are logged: messages can carry ids, emails or tokens.
const rethrowOutage = (what: string, error: unknown): never => {
  console.error(`${what} failed`, {
    status:
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined,
    type: error instanceof Error ? error.name : "unknown",
  });
  throw error;
};

// An unknown user isn't allowed in (403); any other WorkOS failure is an
// outage, not a refusal.
export const orNullIfMissing = (error: unknown): null =>
  error instanceof NotFoundException
    ? null
    : rethrowOutage("WorkOS user lookup", error);

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
      await workos.userManagement.getUser(userId).catch(orNullIfMissing),
    keys: createRemoteJWKSet(new URL("/oauth2/jwks", issuer)),
  };
};

const stringOf = (claim: unknown) => (typeof claim === "string" ? claim : "");

export const createAuth = (env: AuthEnv, deps?: AuthDeps) => {
  const site = siteUrl(env);
  const resource = new URL(`${site}/mcp`);
  const issuer = env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/u, "");
  const resolved = deps ?? workosDeps(env, issuer);

  // RFC 9728: where agents learn that AuthKit signs them in for /mcp.
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  const metadata = {
    authorization_servers: issuer === undefined ? [] : [issuer],
    bearer_methods_supported: ["header"],
    resource: resource.href,
  };

  // A bad token is a 401; a failure to reach AuthKit's keys isn't jose's
  // verdict on the token, so it's logged and the SDK answers it with a 500.
  const verifyAccessToken = async (token: string): Promise<AuthInfo> => {
    if (issuer === undefined || resolved === undefined) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign-in is off");
    }
    const { payload } = await jwtVerify(token, resolved.keys, {
      audience: resource.href,
      issuer,
    }).catch((error: unknown) => {
      if (error instanceof errors.JOSEError) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token");
      }
      return rethrowOutage("AuthKit key fetch", error);
    });
    if (payload.sub === undefined) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Token has no subject");
    }
    return {
      clientId: stringOf(payload["client_id"] ?? payload["azp"]),
      // The SDK refuses a token without one.
      ...(payload.exp === undefined ? {} : { expiresAt: payload.exp }),
      extra: { userId: payload.sub },
      resource,
      scopes: stringOf(payload["scope"]).split(" ").filter(Boolean),
      token,
    };
  };

  // Only requests with an access token issued for /mcp pass; others get a
  // 401 that points the agent at the sign-in flow.
  const gate = requireBearerAuth({
    expectedResource: resource,
    resourceMetadataUrl: metadataUrl,
    verifier: { verifyAccessToken },
  });

  // Checked on every call, not only at sign-in, so taking an email off the
  // allowlist cuts off tokens that were already issued.
  const allowed = async (userId: string) =>
    isAllowed(env, await resolved?.findUser(userId));

  return { allowed, gate, metadata };
};

export type Auth = ReturnType<typeof createAuth>;

// The token check, then the allowlist, then the tools as the token's user.
export const requireMcpAuth =
  (
    auth: Auth,
    handler: (
      request: Request,
      authInfo: AuthInfo
    ) => Promise<Response> | Response
  ) =>
  async (request: Request) => {
    const authInfo = await auth.gate(request);
    if (authInfo instanceof Response) {
      return authInfo;
    }
    if (!(await auth.allowed(stringOf(authInfo.extra?.["userId"])))) {
      return new Response("This account isn't allowed to use wovain.", {
        status: 403,
      });
    }
    return await handler(request, authInfo);
  };
