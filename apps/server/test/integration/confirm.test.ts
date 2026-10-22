import { describe, expect, test } from "vitest";

import { createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { loadEnv } from "../../src/env.ts";
import { designHash } from "../../src/lib/approval.ts";
import { createBrowserConfirm } from "../../src/lib/browser-confirm.ts";
import { createStore } from "../../src/store.ts";
import { fakeUpstream } from "../fake-upstream.ts";
import { demoDesign, testStorage } from "../helpers.ts";

const site = "https://wovain.test";

// wovain's confirm routes with the real browser sign-in. The fake
// authorization server stands in for AuthKit and says who each token
// belongs to.
const setup = async () => {
  const storage = testStorage();
  const fake = fakeUpstream("fourthwall");
  const authEnv = loadAuthEnv({
    WORKOS_AUTHKIT_DOMAIN: "https://auth.upstream.test",
    WOVAIN_SITE_URL: site,
  });
  const routes = { app: undefined as ReturnType<typeof createApp> | undefined };
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    return new URL(request.url).origin === site && routes.app !== undefined
      ? await routes.app.fetch(request)
      : await fake.fetch(request);
  };
  const confirm = createBrowserConfirm({
    db: storage.db,
    fetch,
    site,
    userOf: fake.ownerOf,
  });
  routes.app = createApp({
    auth: createAuth(authEnv),
    authEnv,
    confirm,
    connect: undefined,
    env: loadEnv({}),
    storage,
  });
  const { app } = routes;
  const store = createStore(storage.db, storage.media, "u1");
  const design = await store.saveDesign({ ...demoDesign, status: "draft" });
  const link = await confirm.link("u1", {
    hash: designHash(design),
    id: design.id,
    kind: "design",
  });
  const get = async (url: string, cookie?: string) =>
    await app.request(url.startsWith("/") ? `${site}${url}` : url, {
      redirect: "manual",
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    });
  const post = async (
    body: Record<string, string>,
    headers: Record<string, string>
  ) =>
    await app.request(`${site}/confirm`, {
      body: new URLSearchParams(body),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      method: "POST",
    });
  return { design, fake, get, link, post, store };
};

type Setup = Awaited<ReturnType<typeof setup>>;

const cookieOf = (response: Response) =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

// Opens the link and signs in as `user`; returns the cookie and the page.
const signIn = async (env: Setup, user = "u1") => {
  const start = await env.get(env.link);
  expect(start.status).toBe(302);
  const cookie = cookieOf(start);
  const signInUrl = new URL(start.headers.get("location") ?? "");
  expect(signInUrl.searchParams.get("redirect_uri")).toBe(
    `${site}/confirm/callback`
  );
  const code = env.fake.approve(signInUrl, user);
  const page = await env.get(
    `/confirm/callback?code=${code}&state=${signInUrl.searchParams.get("state") ?? ""}`,
    cookie
  );
  const html = await page.text();
  const secret = /name="secret" value="(?<secret>[^"]+)"/u.exec(html)?.groups?.[
    "secret"
  ];
  return { cookie, html, page, secret };
};

describe("confirm routes", () => {
  test("the merchant signs in, sees the drop's prices and confirms", async () => {
    const env = await setup();
    const { cookie, html, page, secret } = await signIn(env);
    expect(page.status).toBe(200);
    expect(html).toContain("Japanese Cat Sunset Tee");
    expect(html).toContain("$30.00");
    expect(secret).toBeDefined();
    const confirmed = await env.post(
      { secret: secret ?? "" },
      { cookie, origin: site }
    );
    expect(confirmed.status).toBe(200);
    const design = await env.store.requireDesign(env.design.id);
    expect(design.status).toBe("publishing");
    expect(design.approval?.hash).toBe(designHash(env.design));

    // The form works once.
    const again = await env.post(
      { secret: secret ?? "" },
      { cookie, origin: site }
    );
    expect(again.status).toBe(400);
  });

  test("a link works once", async () => {
    const env = await setup();
    await env.get(env.link);
    const reused = await env.get(env.link);
    expect(reused.status).toBe(400);
  });

  test("another wovain account can't confirm", async () => {
    const env = await setup();
    const { page, secret } = await signIn(env, "attacker");
    expect(page.status).toBe(403);
    expect(secret).toBeUndefined();
  });

  test("a confirm from another site or browser is refused", async () => {
    const env = await setup();
    const { cookie, secret } = await signIn(env);
    const crossSite = await env.post(
      { secret: secret ?? "" },
      { cookie, origin: "https://evil.example" }
    );
    expect(crossSite.status).toBe(403);
    const otherBrowser = await env.post(
      { secret: secret ?? "" },
      { cookie: "wovain_confirm=someone-else", origin: site }
    );
    expect(otherBrowser.status).toBe(400);
    const design = await env.store.requireDesign(env.design.id);
    expect(design.status).toBe("draft");
  });

  test("a design changed after the link was made isn't approved", async () => {
    const env = await setup();
    await env.store.updateDesign(env.design.id, {
      quote: { ...env.design.quote, price: 99 },
    });
    const { page, secret } = await signIn(env);
    expect(page.status).toBe(409);
    expect(secret).toBeUndefined();
  });
});
