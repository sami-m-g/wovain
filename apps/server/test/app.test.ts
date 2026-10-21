import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth/auth.ts";
import { loadAuthEnv } from "../src/auth/env.ts";
import { loadEnv } from "../src/env.ts";
import { testStorage } from "./helpers.ts";

const site = "http://localhost:3000";
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";

const authEnv = loadAuthEnv({
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: site,
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  WOVAIN_ALLOWED_EMAILS: "owner@example.com",
});
const storage = await testStorage();
const app = createApp({
  auth: createAuth(authEnv, storage.db),
  authEnv,
  env: loadEnv({}),
  storage,
});

const request = async (pathname: string, init?: RequestInit) =>
  await app.request(`${site}${pathname}`, init);

const json = async (response: Response) =>
  z.record(z.string(), z.unknown()).parse(await response.json());

// Registers a client the way ChatGPT does and follows authorize to /sign-in.
const signInUrl = async () => {
  const registered = await json(
    await request("/api/auth/oauth2/register", {
      body: JSON.stringify({
        client_name: "ChatGPT",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [redirectUri],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      headers: { "content-type": "application/json", origin: site },
      method: "POST",
    })
  );
  const query = new URLSearchParams({
    client_id: z.string().parse(registered["client_id"]),
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    resource: `${site}/mcp`,
    response_type: "code",
    scope: "openid offline_access",
    state: "s1",
  });
  const response = await request(`/api/auth/oauth2/authorize?${query}`);
  return new URL(response.headers.get("location") ?? "", site);
};

describe("routes", () => {
  test("/mcp without a token points at the resource metadata", async () => {
    const response = await request("/mcp", { method: "POST" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `${site}/.well-known/oauth-protected-resource/mcp`
    );
  });

  test("serves the OAuth metadata at the site root", async () => {
    const metadata = await json(
      await request("/.well-known/oauth-authorization-server/api/auth")
    );
    expect(metadata["code_challenge_methods_supported"]).toEqual(["S256"]);
  });
});

describe("sign-in page", () => {
  test("carries the signed OAuth query into its form", async () => {
    const location = await signInUrl();
    expect(location.pathname).toBe("/sign-in");
    const page = await request(`${location.pathname}${location.search}`);
    const html = await page.text();
    expect(html).toContain("Continue with Google");
    expect(html).toContain('name="oauth_query"');
    expect(html).toContain("sig=");
  });

  test("Continue with Google redirects to Google with Better Auth's state cookie", async () => {
    const response = await request("/sign-in", {
      body: new URLSearchParams({ oauth_query: "" }),
      headers: { origin: site },
      method: "POST",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toStartWith(
      "https://accounts.google.com/"
    );
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  test("refuses a form posted from another site", async () => {
    const response = await request("/sign-in", {
      body: new URLSearchParams({ oauth_query: "" }),
      headers: { origin: "https://evil.example" },
      method: "POST",
    });
    expect(response.status).toBe(403);
  });
});

describe("consent page", () => {
  test("refuses an unsigned link", async () => {
    const response = await request(`/consent?client_id=x`);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("This link has expired");
  });

  test("refuses a form posted from another site", async () => {
    const response = await request("/consent", {
      body: new URLSearchParams({ accept: "true", oauth_query: "sig=x" }),
      headers: { origin: "https://evil.example" },
      method: "POST",
    });
    expect(response.status).toBe(403);
  });
});
