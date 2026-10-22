import { setImmediate as nextTick } from "node:timers/promises";

import { describe, expect, test } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections, nonceHashOf } from "../../src/lib/connections.ts";
import type { ProviderId } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import type { Clients } from "../../src/lib/upstream.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
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

// The merchant, signed in to wovain in this browser, approves on the
// provider's page.
const connect = async ({ a, fake, id }: ReturnType<typeof setup>) =>
  await connectWith(a, fake, "u1", id);

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
    const { authorizationUrl, nonceHash } = await connect(env);
    await expect(
      env.a.finishConnect(env.id, {
        code: env.fake.approve(authorizationUrl),
        nonceHash,
        state: authorizationUrl.searchParams.get("state") ?? "",
      })
    ).resolves.toBe(false);
  });

  test("another browser can't finish the flow", async () => {
    const env = setup();
    const authorizationUrl = await env.a.authorize(
      "u1",
      env.id,
      nonceHashOf("victim-browser")
    );
    if (authorizationUrl === undefined) {
      throw new Error("no authorization URL");
    }
    const state = authorizationUrl.searchParams.get("state") ?? "";
    const code = env.fake.approve(authorizationUrl);
    await expect(
      env.a.finishConnect(env.id, {
        code,
        nonceHash: nonceHashOf("attacker-browser"),
        state,
      })
    ).resolves.toBe(false);
    // The flow survives for the browser that started it.
    await expect(
      env.a.finishConnect(env.id, {
        code,
        nonceHash: nonceHashOf("victim-browser"),
        state,
      })
    ).resolves.toBe(true);
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

// wovain's client on a fake Meta, which has no CIMD or DCR: the app ID is
// the client.
const META_APP = { meta: { client_id: "1234567890" } };
const metaUpstream = (clients: Clients = META_APP) => {
  const fake = fakeUpstream("meta");
  const upstream = createUpstream({
    clients,
    connections: createConnections(testStorage().db, localCipher()),
    fetch: fake.fetch,
    site,
  });
  return { fake, upstream };
};
const accounts = {
  args: {},
  id: "meta" as const,
  tool: "ads_get_ad_accounts",
  userId: "u1",
};

describe("Meta, a hand-registered client", () => {
  test("connects with the app ID and asks only for wovain's scopes", async () => {
    const { fake, upstream } = metaUpstream();
    const { authorizationUrl, connected } = await connectWith(
      upstream,
      fake,
      "u1",
      "meta"
    );
    expect(connected).toBe(true);
    expect(authorizationUrl.searchParams.get("client_id")).toBe("1234567890");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      `${site}/oauth/callback/meta`
    );
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "ads_mcp_management ads_management ads_read business_management pages_show_list pages_manage_ads"
    );
    expect(fake.tokenClients).toEqual(["1234567890"]);
    await expect(upstream.call(accounts)).resolves.toMatchObject({
      kind: "result",
    });
    const token = await upstream.accessToken("u1", "meta");
    expect(token.kind === "token" && token.accessToken).toMatch(/^at-/u);
  });

  test("without the app ID, Meta can't be connected", async () => {
    const { upstream } = metaUpstream({});
    expect(upstream.configured("meta")).toBe(false);
    expect(upstream.configured("fal")).toBe(true);
    await expect(
      upstream.authorize("u1", "meta", nonceHashOf("this-browser"))
    ).rejects.toThrow("No meta client configured");
  });

  test("without a grant, the token is a connect link", async () => {
    const { upstream } = metaUpstream();
    await expect(upstream.accessToken("u1", "meta")).resolves.toMatchObject({
      connect: { needsConnection: "meta", reconnect: false },
      kind: "connect",
    });
  });

  test("disconnect forgets the grant", async () => {
    const { fake, upstream } = metaUpstream();
    await connectWith(upstream, fake, "u1", "meta");
    await expect(upstream.disconnect("u1", "meta")).resolves.toBe(true);
    await expect(upstream.call(accounts)).resolves.toMatchObject({
      kind: "connect",
    });
  });
});
