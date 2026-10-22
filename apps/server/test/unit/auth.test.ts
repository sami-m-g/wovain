import { NotFoundException } from "@workos-inc/node";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, test } from "vitest";

import {
  createAuth,
  orNullIfMissing,
  requireMcpAuth,
} from "../../src/auth/auth.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";

const site = "http://localhost:3000";
const issuer = "https://wovain.authkit.app";

// AuthKit's signing key and users, stood in for locally.
const { privateKey, publicKey } = await generateKeyPair("RS256");
const users = new Map([
  ["user_owner", { email: "owner@example.com", emailVerified: true }],
  ["user_stranger", { email: "stranger@example.com", emailVerified: true }],
  ["user_unverified", { email: "owner@example.com", emailVerified: false }],
]);

const authEnv = loadAuthEnv({
  WORKOS_AUTHKIT_DOMAIN: issuer,
  WOVAIN_ALLOWED_EMAILS: "Owner@Example.com",
  WOVAIN_SITE_URL: site,
});
const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), alg: "RS256" }],
});

const auth = createAuth(authEnv, {
  findUser: async (userId) => {
    if (userId === "user_outage") {
      throw new Error("WorkOS is down");
    }
    return await Promise.resolve(users.get(userId) ?? null);
  },
  keys,
});

// Echoes what reaches the tools.
const guarded = requireMcpAuth(auth, (_request, { clientId, extra, scopes }) =>
  Response.json({ clientId, scopes, userId: extra?.["userId"] })
);

const tokenFor = async (
  sub: string,
  { audience = `${site}/mcp`, expires = "5m", from = issuer } = {}
) =>
  await new SignJWT({ client_id: "chatgpt", scope: "openid email" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(sub)
    .setIssuer(from)
    .setAudience(audience)
    .setExpirationTime(expires)
    .sign(privateKey);

const call = async (authorization?: string, gate = guarded) =>
  await gate(
    new Request(`${site}/mcp`, {
      headers: authorization === undefined ? {} : { authorization },
      method: "POST",
    })
  );

const statusOf = async (token: string, gate = guarded) => {
  const response = await call(`Bearer ${token}`, gate);
  return response.status;
};

const reached = () => new Response("reached");

// The discovery chain ChatGPT follows (developers.openai.com/plugins/build/auth).
describe("OAuth for ChatGPT", () => {
  test.each([undefined, "Basic dXNlcjpwYXNz"])(
    "/mcp with %s for a token points at the resource metadata",
    async (authorization) => {
      const response = await call(authorization);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(
        /^Bearer error="invalid_token", .*resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/mcp"$/u
      );
    }
  );

  test("resource metadata names AuthKit as the authorization server", () => {
    expect(auth.metadata).toEqual({
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource: `${site}/mcp`,
    });
  });

  test("a token for /mcp reaches the tools as its user", async () => {
    const response = await call(`Bearer ${await tokenFor("user_owner")}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientId: "chatgpt",
      scopes: ["openid", "email"],
      userId: "user_owner",
    });
  });

  test("refuses tokens for another resource or issuer", async () => {
    const wrongAudience = await tokenFor("user_owner", {
      audience: "https://elsewhere.example/mcp",
    });
    const wrongIssuer = await tokenFor("user_owner", {
      from: "https://evil.authkit.app",
    });
    expect(await statusOf(wrongAudience)).toBe(401);
    expect(await statusOf(wrongIssuer)).toBe(401);
  });

  test("refuses an expired token", async () => {
    const expired = await tokenFor("user_owner", { expires: "-1m" });
    expect(await statusOf(expired)).toBe(401);
  });

  test("answers 500 when AuthKit's keys can't be fetched", async () => {
    const unreachable = requireMcpAuth(
      createAuth(authEnv, {
        findUser: async () => await Promise.resolve(null),
        keys: async () => await Promise.reject(new TypeError("fetch failed")),
      }),
      reached
    );
    expect(await statusOf(await tokenFor("user_owner"), unreachable)).toBe(500);
  });

  test("refuses every token while sign-in is off", async () => {
    const off = requireMcpAuth(
      createAuth(loadAuthEnv({ WOVAIN_SITE_URL: site })),
      reached
    );
    expect(await statusOf(await tokenFor("user_owner"), off)).toBe(401);
  });
});

// Everyone signed in acts through the operator's Meta and fal keys for now.
describe("allowlist", () => {
  test("refuses a signed-in email that isn't listed", async () => {
    expect(await statusOf(await tokenFor("user_stranger"))).toBe(403);
  });

  test("refuses a listed email that isn't verified", async () => {
    expect(await statusOf(await tokenFor("user_unverified"))).toBe(403);
  });

  test("refuses a user WorkOS doesn't know", async () => {
    expect(await statusOf(await tokenFor("user_gone"))).toBe(403);
  });

  test("a WorkOS outage is an error, not a refusal", async () => {
    await expect(statusOf(await tokenFor("user_outage"))).rejects.toThrow(
      "WorkOS is down"
    );
  });
});

describe("WorkOS lookups", () => {
  test("an unknown user reads as no user", () => {
    expect(
      orNullIfMissing(new NotFoundException({ path: "/u", requestID: "r" }))
    ).toBeNull();
  });

  test("any other error is rethrown", () => {
    const outage = new Error("503");
    expect(() => orNullIfMissing(outage)).toThrow(outage);
  });
});
