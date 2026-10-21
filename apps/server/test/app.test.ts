import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth/auth.ts";
import { loadAuthEnv } from "../src/auth/env.ts";
import { loadEnv } from "../src/env.ts";
import { testStorage } from "./helpers.ts";

const site = "http://localhost:3000";
const issuer = "https://wovain.authkit.app";

const authEnv = loadAuthEnv({
  WORKOS_API_KEY: "sk_test",
  WORKOS_AUTHKIT_DOMAIN: issuer,
  WOVAIN_ALLOWED_EMAILS: "owner@example.com",
  WOVAIN_SITE_URL: site,
});
const app = createApp({
  auth: createAuth(authEnv),
  authEnv,
  env: loadEnv({}),
  storage: await testStorage(),
});

const request = async (pathname: string, init?: RequestInit) =>
  await app.request(`${site}${pathname}`, init);

const json = async (response: Response) =>
  z.record(z.string(), z.unknown()).parse(await response.json());

describe("routes", () => {
  test("/mcp without a token points at the resource metadata", async () => {
    const response = await request("/mcp", { method: "POST" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `${site}/.well-known/oauth-protected-resource/mcp`
    );
  });

  test("/mcp refuses a token AuthKit didn't sign", async () => {
    const response = await request("/mcp", {
      headers: { authorization: "Bearer not.a.jwt" },
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  test("serves the resource metadata at the site root", async () => {
    const metadata = await Promise.all(
      [
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
      ].map(async (path) => await json(await request(path)))
    );
    for (const document of metadata) {
      expect(document["resource"]).toBe(`${site}/mcp`);
      expect(document["authorization_servers"]).toEqual([issuer]);
    }
  });

  test("no longer serves its own sign-in or consent", async () => {
    const responses = await Promise.all(
      ["/sign-in", "/consent", "/api/auth/ok"].map(
        async (path) => await request(path)
      )
    );
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404,
    ]);
  });
});
