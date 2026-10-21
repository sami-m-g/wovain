import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, test } from "vitest";

import { createAuth, requireMcpAuth } from "../../src/auth/auth.ts";
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

const auth = createAuth(
  loadAuthEnv({
    WORKOS_AUTHKIT_DOMAIN: issuer,
    WOVAIN_ALLOWED_EMAILS: "Owner@Example.com",
    WOVAIN_SITE_URL: site,
  }),
  {
    findUser: async (userId) =>
      await Promise.resolve(users.get(userId) ?? null),
    keys: createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), alg: "RS256" }],
    }),
  }
);

const guarded = requireMcpAuth(
  auth,
  (_request, caller) => new Response(caller.userId)
);

const tokenFor = async (
  sub: string,
  { audience = `${site}/mcp`, from = issuer } = {}
) =>
  await new SignJWT({ scope: "openid email" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(sub)
    .setIssuer(from)
    .setAudience(audience)
    .setExpirationTime("5m")
    .sign(privateKey);

const call = async (token?: string) =>
  await guarded(
    new Request(`${site}/mcp`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      method: "POST",
    })
  );

const statusOf = async (token: string) => {
  const response = await call(token);
  return response.status;
};

// The discovery chain ChatGPT follows (developers.openai.com/plugins/build/auth).
describe("OAuth for ChatGPT", () => {
  test("/mcp without a token points at the resource metadata", async () => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${site}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  test("resource metadata names AuthKit as the authorization server", () => {
    expect(auth.metadata).toEqual({
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource: `${site}/mcp`,
    });
  });

  test("a token for /mcp reaches the tools as its user", async () => {
    const response = await call(await tokenFor("user_owner"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("user_owner");
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
});
