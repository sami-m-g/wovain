import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { loadEnv } from "../../src/env.ts";
import { createBrowserSignIn } from "../../src/lib/browser-sign-in.ts";
import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
import { connectClient, testStorage, testStore } from "../helpers.ts";

const site = "https://wovain.test";

// wovain's routes with the real browser sign-in and upstream client. The
// fake authorization server stands in for both AuthKit (signing in to
// wovain) and the provider, and says who each token belongs to.
const setup = () => {
  const storage = testStorage();
  const fake = fakeUpstream("fourthwall");
  const connections = createConnections(storage.db, localCipher());
  const authEnv = loadAuthEnv({
    WORKOS_AUTHKIT_DOMAIN: "https://auth.upstream.test",
    WOVAIN_SITE_URL: site,
  });
  const routes = { app: undefined as ReturnType<typeof createApp> | undefined };
  // wovain's own metadata comes from the app; everything else from the fake.
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    return new URL(request.url).origin === site && routes.app !== undefined
      ? await routes.app.fetch(request)
      : await fake.fetch(request);
  };
  const upstream = createUpstream({ connections, fetch, site });
  const signIn = createBrowserSignIn({
    connections,
    fetch,
    site,
    userOf: fake.ownerOf,
  });
  routes.app = createApp({
    auth: createAuth(authEnv),
    authEnv,
    connect: { signIn, upstream },
    env: loadEnv({}),
    storage,
  });
  const { app } = routes;
  const get = async (pathname: string, cookie?: string) =>
    await app.request(`${site}${pathname}`, {
      redirect: "manual",
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    });
  return { fake, get, storage, upstream };
};

type Setup = ReturnType<typeof setup>;

const pathOf = (url: string) => {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
};
const locationOf = (response: Response) =>
  new URL(response.headers.get("location") ?? "");
const cookieOf = (response: Response) =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const backTo = (provider: string, code: string, at: URL) =>
  `/oauth/callback/${provider}?code=${code}&state=${at.searchParams.get("state") ?? ""}`;

// Opens a fresh link for u1 and returns AuthKit's sign-in page and the cookie.
const openLink = async ({ get, upstream }: Setup) => {
  const start = await get(
    pathOf(await upstream.connectUrl("u1", "fourthwall"))
  );
  expect(start.status).toBe(302);
  return { cookie: cookieOf(start), signInUrl: locationOf(start) };
};

describe("connect routes", () => {
  test("serve wovain's client metadata document", async () => {
    const { get } = setup();
    const response = await get("/oauth/client.json");
    const body = z
      .object({ client_id: z.string(), redirect_uris: z.array(z.string()) })
      .parse(await response.json());
    expect(body).toEqual({
      client_id: `${site}/oauth/client.json`,
      redirect_uris: [
        `${site}/oauth/callback/fourthwall`,
        `${site}/oauth/callback/fal`,
        `${site}/oauth/callback/wovain`,
        `${site}/confirm/callback`,
      ],
    });
  });

  test("refuse a missing, unknown or reused ticket", async () => {
    const env = setup();
    const statusOf = async (pathname: string) => {
      const response = await env.get(pathname);
      return response.status;
    };
    await expect(statusOf("/connect/fourthwall")).resolves.toBe(400);
    await expect(statusOf("/connect/fourthwall?ticket=nope")).resolves.toBe(
      400
    );
    await expect(statusOf("/connect/meta?ticket=nope")).resolves.toBe(400);
    const link = pathOf(await env.upstream.connectUrl("u1", "fourthwall"));
    await expect(statusOf(link)).resolves.toBe(302);
    await expect(statusOf(link)).resolves.toBe(400);
  });

  test("sign the merchant in, then connect the provider, in one browser", async () => {
    const env = setup();
    const { cookie, signInUrl } = await openLink(env);
    expect(cookie).toMatch(/^wovain_connect=/u);
    expect(signInUrl.searchParams.get("redirect_uri")).toBe(
      `${site}/oauth/callback/wovain`
    );
    expect(signInUrl.searchParams.get("resource")).toBe(`${site}/mcp`);

    const signedIn = await env.get(
      backTo("wovain", env.fake.approve(signInUrl, "u1"), signInUrl),
      cookie
    );
    expect(signedIn.status).toBe(302);
    const consent = locationOf(signedIn);
    expect(consent.searchParams.get("redirect_uri")).toBe(
      `${site}/oauth/callback/fourthwall`
    );

    const done = await env.get(
      backTo("fourthwall", env.fake.approve(consent), consent),
      cookie
    );
    expect(done.status).toBe(200);
    expect(await done.text()).toContain("Fourthwall connected");
    const doc = await env.storage.db
      .doc("users/u1/connections/fourthwall")
      .get();
    expect(doc.exists).toBe(true);
    expect(JSON.stringify(doc.data())).not.toMatch(/at-|rt-/u);
  });

  test("refuse a sign-in without the link's cookie", async () => {
    const env = setup();
    const { signInUrl } = await openLink(env);
    const code = env.fake.approve(signInUrl, "u1");
    const missing = await env.get(backTo("wovain", code, signInUrl));
    expect(missing.status).toBe(400);
    const wrong = await env.get(
      backTo("wovain", code, signInUrl),
      "wovain_connect=someone-else"
    );
    expect(wrong.status).toBe(400);
  });

  test("refuse a different wovain account than the link's", async () => {
    const env = setup();
    const { cookie, signInUrl } = await openLink(env);
    const response = await env.get(
      backTo("wovain", env.fake.approve(signInUrl, "attacker"), signInUrl),
      cookie
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("different wovain account");
  });

  test("refuse a provider callback from another browser", async () => {
    const env = setup();
    const { cookie, signInUrl } = await openLink(env);
    const signedIn = await env.get(
      backTo("wovain", env.fake.approve(signInUrl, "u1"), signInUrl),
      cookie
    );
    const consent = locationOf(signedIn);
    const code = env.fake.approve(consent);
    const missing = await env.get(backTo("fourthwall", code, consent));
    expect(missing.status).toBe(400);
    const other = await env.get(
      backTo("fourthwall", code, consent),
      "wovain_connect=another-browser"
    );
    expect(other.status).toBe(400);
    const wrongProvider = await env.get(backTo("fal", code, consent), cookie);
    expect(wrongProvider.status).toBe(400);
  });

  test("show a failure page when the merchant declines", async () => {
    const { get } = setup();
    const response = await get(
      "/oauth/callback/fourthwall?error=access_denied&state=abc",
      "wovain_connect=x"
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not connected");
  });
});

describe("proxy tools", () => {
  test("answer with a personal connect link before the merchant connects", async () => {
    const { storage, upstream } = setup();
    const client = await connectClient({}, testStore(storage), { upstream });
    const result = await client.callTool({
      arguments: { tool: "ecommerce_get-current-shop" },
      name: "fourthwall",
    });
    expect(result.structuredContent).toMatchObject({
      needsConnection: "fourthwall",
      reconnect: false,
    });
    expect(JSON.stringify(result.content)).toContain("personal");
  });

  test("refuse tools outside the allowlist", async () => {
    const { storage, upstream } = setup();
    const client = await connectClient({}, testStore(storage), { upstream });
    const publish = await client.callTool({
      arguments: { tool: "ecommerce_update-offer-status" },
      name: "fourthwall",
    });
    expect(publish.isError).toBe(true);
    const spend = await client.callTool({
      arguments: { tool: "submit_jobs" },
      name: "fal",
    });
    expect(spend.isError).toBe(true);
  });

  test("forward an allowed call over the merchant's grant", async () => {
    const { fake, storage, upstream } = setup();
    await connectWith(upstream, fake, "test", "fourthwall");
    const client = await connectClient({}, testStore(storage), { upstream });
    const result = await client.callTool({
      arguments: { tool: "ecommerce_get-current-shop" },
      name: "fourthwall",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ ok: true });
  });

  test("say connections are off without a key", async () => {
    const client = await connectClient({}, testStore());
    const result = await client.callTool({
      arguments: { tool: "ecommerce_get-current-shop" },
      name: "fourthwall",
    });
    expect(result.structuredContent).toEqual({ configured: false });
  });
});
