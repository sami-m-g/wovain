import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { loadEnv } from "../../src/env.ts";
import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { fakeUpstream } from "../fake-upstream.ts";
import { connectClient, testStorage, testStore } from "../helpers.ts";

const site = "https://wovain.test";

const setup = () => {
  const storage = testStorage();
  const fake = fakeUpstream("fourthwall");
  const upstream = createUpstream({
    connections: createConnections(storage.db, localCipher()),
    fetch: fake.fetch,
    site,
  });
  const authEnv = loadAuthEnv({ WOVAIN_SITE_URL: site });
  const app = createApp({
    auth: createAuth(authEnv),
    authEnv,
    env: loadEnv({}),
    storage,
    upstream,
  });
  const get = async (pathname: string) =>
    await app.request(`${site}${pathname}`, { redirect: "manual" });
  const status = async (pathname: string) => {
    const response = await get(pathname);
    return response.status;
  };
  return { fake, get, status, storage, upstream };
};

const linkPath = (connectUrl: string) => {
  const url = new URL(connectUrl);
  return `${url.pathname}${url.search}`;
};

describe("connect routes", () => {
  test("serve wovain's client metadata document", async () => {
    const { get } = setup();
    const response = await get("/oauth/client.json");
    const body = z
      .object({
        client_id: z.string(),
        redirect_uris: z.array(z.string()),
        token_endpoint_auth_method: z.string(),
      })
      .parse(await response.json());
    expect(body).toEqual({
      client_id: `${site}/oauth/client.json`,
      redirect_uris: [
        `${site}/oauth/callback/fourthwall`,
        `${site}/oauth/callback/fal`,
      ],
      token_endpoint_auth_method: "none",
    });
  });

  test("refuse a missing or unknown ticket", async () => {
    const { status } = setup();
    await expect(status("/connect/fourthwall")).resolves.toBe(400);
    await expect(status("/connect/fourthwall?ticket=nope")).resolves.toBe(400);
    await expect(status("/connect/meta?ticket=nope")).resolves.toBe(400);
  });

  test("send the merchant to consent, then store the grant encrypted", async () => {
    const { fake, get, status, storage, upstream } = setup();
    const link = await upstream.connectUrl("u1", "fourthwall");
    const start = await get(linkPath(link));
    expect(start.status).toBe(302);
    const consent = new URL(start.headers.get("location") ?? "");
    expect(consent.origin).toBe("https://auth.upstream.test");

    // The same link doesn't work twice.
    await expect(status(linkPath(link))).resolves.toBe(400);

    const state = consent.searchParams.get("state") ?? "";
    const wrongProvider = await get(
      `/oauth/callback/fal?code=x&state=${state}`
    );
    expect(wrongProvider.status).toBe(400);

    // The wrong-provider attempt used up that flow; start again.
    const again = await get(
      linkPath(await upstream.connectUrl("u1", "fourthwall"))
    );
    const retry = new URL(again.headers.get("location") ?? "");
    const code = fake.approve(retry);
    const done = await get(
      `/oauth/callback/fourthwall?code=${code}&state=${retry.searchParams.get("state") ?? ""}`
    );
    expect(done.status).toBe(200);
    expect(await done.text()).toContain("Fourthwall connected");

    const doc = await storage.db.doc("users/u1/connections/fourthwall").get();
    expect(doc.exists).toBe(true);
    expect(JSON.stringify(doc.data())).not.toMatch(/at-|rt-/u);
  });

  test("show a failure page when the merchant declines", async () => {
    const { get } = setup();
    const response = await get(
      "/oauth/callback/fourthwall?error=access_denied&state=abc"
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not connected");
  });
});

describe("proxy tools", () => {
  test("answer with a connect link before the merchant connects", async () => {
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
  });

  test("refuse tools outside the allowlist", async () => {
    const { storage, upstream } = setup();
    const client = await connectClient({}, testStore(storage), { upstream });
    const result = await client.callTool({
      arguments: { tool: "ecommerce_update-offer-status" },
      name: "fourthwall",
    });
    expect(result.isError).toBe(true);
    const spend = await client.callTool({
      arguments: { tool: "submit_jobs" },
      name: "fal",
    });
    expect(spend.isError).toBe(true);
  });

  test("forward an allowed call over the merchant's grant", async () => {
    const { fake, storage, upstream } = setup();
    const link = await upstream.connectUrl("test", "fourthwall");
    const ticket = new URL(link).searchParams.get("ticket") ?? "";
    const consent = await upstream.startConnect(ticket, "fourthwall");
    if (consent === undefined) {
      throw new Error("no consent URL");
    }
    await upstream.finishConnect("fourthwall", {
      code: fake.approve(consent),
      state: consent.searchParams.get("state") ?? "",
    });
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
