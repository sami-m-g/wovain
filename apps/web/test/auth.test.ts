import { describe, expect, test } from "bun:test";

import { requireMcpAuth } from "@better-auth/mcp";
import { createTestDb } from "@wovain-foss/db/testing";
import { z } from "zod";

import { createAuth } from "../lib/auth.ts";
import { loadAuthEnv } from "../lib/env.ts";

const site = "http://localhost:3000";
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";

const auth = createAuth(
  loadAuthEnv({
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: site,
    WOVAIN_ALLOWED_EMAILS: "Owner@Example.com",
  }),
  await createTestDb()
);

const get = async (pathname: string) =>
  await auth.handler(new Request(`${site}${pathname}`));

const json = async (response: Response) =>
  z.record(z.string(), z.unknown()).parse(await response.json());

// The discovery chain ChatGPT follows (developers.openai.com/plugins/build/auth).
describe("OAuth for ChatGPT", () => {
  test("/mcp without a token points at the resource metadata", async () => {
    const guarded = requireMcpAuth(auth, () => new Response("tools"), {
      resource: `${site}/mcp`,
    });
    const response = await guarded(
      new Request(`${site}/mcp`, { method: "POST" })
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${site}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  test("resource metadata names this server as the authorization server", async () => {
    const metadata = await json(
      await get("/.well-known/oauth-protected-resource/mcp")
    );
    expect(metadata["resource"]).toBe(`${site}/mcp`);
    expect(metadata["authorization_servers"]).toEqual([`${site}/api/auth`]);
  });

  test("authorization server metadata offers PKCE S256, CIMD and registration", async () => {
    const metadata = await json(
      await get("/.well-known/oauth-authorization-server/api/auth")
    );
    expect(metadata["code_challenge_methods_supported"]).toEqual(["S256"]);
    expect(metadata["client_id_metadata_document_supported"]).toBe(true);
    expect(metadata["registration_endpoint"]).toBe(
      `${site}/api/auth/oauth2/register`
    );
  });

  test("a registered client is sent to /sign-in with a signed query", async () => {
    const registered = await json(
      await auth.handler(
        new Request(`${site}/api/auth/oauth2/register`, {
          body: JSON.stringify({
            client_name: "ChatGPT",
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: [redirectUri],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      )
    );
    const clientId = z.string().parse(registered["client_id"]);
    const query = new URLSearchParams({
      client_id: clientId,
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      resource: `${site}/mcp`,
      response_type: "code",
      scope: "openid offline_access",
      state: "s1",
    });
    const response = await get(`/api/auth/oauth2/authorize?${query}`);
    const location = new URL(response.headers.get("location") ?? "", site);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("client_id")).toBe(clientId);
    expect(location.searchParams.has("sig")).toBe(true);
  });
});

const createUser = async (email: string) => {
  const { internalAdapter } = await auth.$context;
  return await internalAdapter
    .createUser(
      { email, emailVerified: true, name: "Test" },
      { method: "admin" }
    )
    .catch(() => null);
};

// Everyone signed in acts through the operator's Meta and fal keys for now.
describe("sign-in allowlist", () => {
  test("lets a listed email create an account, ignoring case", async () => {
    expect(await createUser("owner@example.com")).not.toBeNull();
  });

  test("creates no account for anyone else", async () => {
    expect(await createUser("stranger@example.com")).toBeNull();
  });
});
