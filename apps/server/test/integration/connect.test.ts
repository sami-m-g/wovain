import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
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
  const env = loadEnv({
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
    auth: createAuth(env),
    connect: { signIn, upstream },
    env,
    storage,
  });
  const { app } = routes;
  const get = async (pathname: string, cookie?: string) =>
    await app.request(`${site}${pathname}`, {
      redirect: "manual",
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    });
  return { app, fake, get, storage, upstream };
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

  test("name the tools the upstream has when it lacks the one called", async () => {
    const { fake, storage, upstream } = setup();
    await connectWith(upstream, fake, "test", "fourthwall");
    const client = await connectClient({}, testStore(storage), { upstream });
    // Allowlisted, but this fake Fourthwall (like a real one that dropped a
    // tool) doesn't have it.
    const result = await client.callTool({
      arguments: { tool: "omni_knowledge" },
      name: "fourthwall",
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      // Only the tools the proxy allows, not the fake's Meta or fal ones.
      available: ["ecommerce_get-current-shop"],
      missingTool: "omni_knowledge",
    });
    expect(JSON.stringify(result.content)).toContain(
      "Fourthwall has no tool named omni_knowledge"
    );
  });

  test("refuse get-instructions, which Fourthwall's /app endpoint doesn't have", async () => {
    const { fake, storage, upstream } = setup();
    await connectWith(upstream, fake, "test", "fourthwall");
    const client = await connectClient({}, testStore(storage), { upstream });
    const result = await client.callTool({
      arguments: { tool: "get-instructions" },
      name: "fourthwall",
    });
    expect(result.isError).toBe(true);
    expect(fake.calls).toEqual([]);
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

// The cookie named `name` among a response's Set-Cookie headers.
const cookieNamed = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`)) ?? "";

// u1's launch request for campaign 555, opened in a browser and signed in
// to wovain as `user`: the confirm page and its cookie.
const openConfirm = async (env: Setup, user = "u1") => {
  const url = await env.upstream.confirmLaunchUrl("u1", {
    campaignId: "555",
    snapshot: "snap",
    summary: "Cat tee at $15.00 a day",
  });
  const start = await env.get(pathOf(url));
  expect(start.status).toBe(302);
  const signInUrl = locationOf(start);
  const shown = await env.get(
    backTo("wovain", env.fake.approve(signInUrl, user), signInUrl),
    cookieOf(start)
  );
  const html = await shown.text();
  return {
    action: /action="(?<action>[^"]+)"/u.exec(html)?.groups?.["action"] ?? "",
    cookie: cookieNamed(shown, "wovain_launch"),
    csrf:
      /name="csrf" value="(?<csrf>[^"]+)"/u.exec(html)?.groups?.["csrf"] ?? "",
    html,
    status: shown.status,
  };
};

const post = async (
  env: Setup,
  action: string,
  {
    cookie,
    csrf,
    origin = site,
  }: { cookie?: string; csrf?: string; origin?: string }
) =>
  await env.app.request(`${site}${action}`, {
    body: new URLSearchParams(csrf === undefined ? {} : { csrf }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      ...(cookie === undefined ? {} : { cookie }),
    },
    method: "POST",
  });

describe("launch confirm page", () => {
  test("the merchant signs in, sees the campaign and confirms it once", async () => {
    const env = setup();
    const page = await openConfirm(env);
    expect(page.status).toBe(200);
    expect(page.html).toContain("Cat tee at $15.00 a day");
    expect(page.cookie).toMatch(/^wovain_launch=/u);
    expect(page.csrf).not.toBe("");
    const confirmed = await post(env, page.action, page);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.text()).toContain("Launch confirmed");
    await expect(
      env.upstream.launches.consume("u1", "555", "snap")
    ).resolves.toBe(true);
    await expect(
      env.upstream.launches.consume("u1", "555", "snap")
    ).resolves.toBe(false);
    const replay = await post(env, page.action, page);
    expect(replay.status).toBe(403);
  });

  test("a different wovain account can't confirm", async () => {
    const env = setup();
    const page = await openConfirm(env, "attacker");
    expect(page.status).toBe(403);
    expect(page.csrf).toBe("");
    await expect(
      env.upstream.launches.consume("u1", "555", "snap")
    ).resolves.toBe(false);
  });

  test("a POST without the CSRF token, the page's cookie or this site's origin is refused", async () => {
    const env = setup();
    const page = await openConfirm(env);
    for (const attempt of [
      { cookie: page.cookie },
      { cookie: page.cookie, csrf: "guessed" },
      { csrf: page.csrf },
      { cookie: page.cookie, csrf: page.csrf, origin: "https://evil.example" },
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await post(env, page.action, attempt);
      expect(response.status).toBe(403);
    }
    await expect(
      env.upstream.launches.consume("u1", "555", "snap")
    ).resolves.toBe(false);
  });

  test("an unknown launch link is refused", async () => {
    const { get } = setup();
    const response = await get("/confirm/launch/nope");
    expect(response.status).toBe(400);
  });
});
