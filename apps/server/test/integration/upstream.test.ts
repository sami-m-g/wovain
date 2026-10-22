import { setImmediate as nextTick } from "node:timers/promises";

import { describe, expect, test } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import type { ProviderId } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { fakeUpstream } from "../fake-upstream.ts";
import { testStorage } from "../helpers.ts";

const site = "https://wovain.test";

// One fake provider and two wovain instances sharing Firestore, as in
// production (maxInstances 2).
const setup = (id: ProviderId = "fourthwall", expiresIn?: number) => {
  const { db } = testStorage();
  const clock = { now: Date.now() };
  const cipher = localCipher();
  const fake = fakeUpstream(id, expiresIn === undefined ? {} : { expiresIn });
  const instance = () =>
    createUpstream({
      connections: createConnections(db, cipher, () => clock.now),
      fetch: fake.fetch,
      now: () => clock.now,
      site,
      sleep: async () => {
        await nextTick();
      },
    });
  return { a: instance(), b: instance(), clock, db, fake, id };
};

const ticketOf = (connectUrl: string) =>
  new URL(connectUrl).searchParams.get("ticket") ?? "";

// The merchant follows the link and approves on the provider's page.
const connect = async ({ a, fake, id }: ReturnType<typeof setup>) => {
  const link = await a.connectUrl("u1", id);
  const authorizationUrl = await a.startConnect(ticketOf(link), id);
  if (authorizationUrl === undefined) {
    throw new Error("no authorization URL");
  }
  const state = authorizationUrl.searchParams.get("state") ?? "";
  const connected = await a.finishConnect(id, {
    code: fake.approve(authorizationUrl),
    state,
  });
  return { authorizationUrl, connected };
};

const shop = { args: {}, tool: "ecommerce_get-current-shop", userId: "u1" };

describe("connected calls", () => {
  test("without a grant, the result is a connect link", async () => {
    const { a, id } = setup();
    const outcome = await a.call({ ...shop, id });
    expect(outcome).toMatchObject({
      connect: { needsConnection: "fourthwall", reconnect: false },
      kind: "connect",
    });
    expect(outcome.kind === "connect" && outcome.connect.connectUrl).toMatch(
      /^https:\/\/wovain\.test\/connect\/fourthwall\?ticket=/u
    );
  });

  test("connect, then call through the merchant's grant", async () => {
    const env = setup();
    const { authorizationUrl, connected } = await connect(env);
    expect(authorizationUrl.origin).toBe("https://auth.upstream.test");
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      `${site}/oauth/client.json`
    );
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      `${site}/oauth/callback/fourthwall`
    );
    expect(authorizationUrl.searchParams.get("resource")).toBe(
      "https://mcp.fourthwall.com/app"
    );
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256"
    );
    expect(connected).toBe(true);

    const outcome = await env.b.call({ ...shop, id: env.id });
    expect(outcome).toMatchObject({
      kind: "result",
      result: { structuredContent: { ok: true } },
    });
    expect(env.fake.calls).toEqual([
      { arguments: {}, name: "ecommerce_get-current-shop" },
    ]);
  });

  test("a used state can't be exchanged twice", async () => {
    const env = setup();
    const { authorizationUrl } = await connect(env);
    await expect(
      env.a.finishConnect(env.id, {
        code: env.fake.approve(authorizationUrl),
        state: authorizationUrl.searchParams.get("state") ?? "",
      })
    ).resolves.toBe(false);
  });

  test("a grant near expiry is refreshed once, even by two instances", async () => {
    const env = setup("fal", 3600);
    await connect(env);
    env.clock.now += 3600 * 1000 - 30_000;
    const [first, second] = await Promise.all([
      env.a.call({ ...shop, id: "fal", tool: "check_account_status" }),
      env.b.call({ ...shop, id: "fal", tool: "check_account_status" }),
    ]);
    expect(first.kind).toBe("result");
    expect(second.kind).toBe("result");
    expect(env.fake.stats.refreshes).toBe(1);
  });

  test("an expired access token is refreshed on the 401", async () => {
    const env = setup();
    await connect(env);
    env.fake.expireAccessTokens();
    const outcome = await env.a.call({ ...shop, id: env.id });
    expect(outcome.kind).toBe("result");
    expect(env.fake.stats.refreshes).toBe(1);
  });

  test("a revoked grant asks the merchant to reconnect", async () => {
    const env = setup();
    await connect(env);
    env.fake.revokeAll();
    const outcome = await env.a.call({ ...shop, id: env.id });
    expect(outcome).toMatchObject({
      connect: { reconnect: true },
      kind: "connect",
    });
    const doc = await env.db.doc("users/u1/connections/fourthwall").get();
    expect(doc.exists).toBe(false);
  });

  test("Fourthwall's login-needed answer asks the merchant to reconnect", async () => {
    const env = setup();
    await connect(env);
    env.fake.setLoginNeeded(true);
    const outcome = await env.a.call({ ...shop, id: env.id });
    expect(outcome).toMatchObject({
      connect: { reconnect: true },
      kind: "connect",
    });
  });
});
