import { EvlogError } from "evlog";
import { describe, expect, it } from "vitest";

import { createUpstream } from "./upstream";
import type { Grant, GrantStore } from "./upstream";

// A merchant's fal session against fake HTTP: fal's relay (an MCP server),
// its protected resource metadata and its authorization server. The relay
// takes one access token at a time; the token endpoint answers a refresh.

const RELAY = "https://mcp.fal.ai/mcp-relay";
const RESOURCE_METADATA =
  "https://mcp.fal.ai/.well-known/oauth-protected-resource/mcp-relay";
const ISSUER = "https://auth.example";
const HOUR_S = 3600;
const nowS = () => Math.floor(Date.now() / 1000);

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { headers, status });

interface Relay {
  // The access token the relay accepts.
  valid: string;
  // How the relay refuses another token: HTTP 401, or inside the tool.
  refuses: "http" | "tool";
  // A tool's error text when it refuses.
  refusal: string;
  // The token endpoint's answer to a refresh.
  refresh: () => Response;
  refreshes: number;
  calls: string[];
}

interface RpcMessage {
  id?: number;
  method: string;
  params?: { name?: string; protocolVersion?: string };
}

const AUTH_SERVER = {
  authorization_endpoint: `${ISSUER}/authorize`,
  client_id_metadata_document_supported: true,
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  issuer: ISSUER,
  response_types_supported: ["code"],
  token_endpoint: `${ISSUER}/token`,
  token_endpoint_auth_methods_supported: ["none"],
};

const toolResult = (authorized: boolean, refusal: string) =>
  authorized
    ? { content: [{ text: '{"request_id":"req_1"}', type: "text" }] }
    : { content: [{ text: refusal, type: "text" }], isError: true };

// The relay's answer to one JSON-RPC message.
const answer = (relay: Relay, message: RpcMessage, authorized: boolean) => {
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  if (message.method === "initialize") {
    return json({
      id: message.id,
      jsonrpc: "2.0",
      result: {
        capabilities: { tools: {} },
        protocolVersion: message.params?.protocolVersion,
        serverInfo: { name: "fake fal", version: "1" },
      },
    });
  }
  if (message.method === "tools/call") {
    relay.calls.push(message.params?.name ?? "");
    return json({
      id: message.id,
      jsonrpc: "2.0",
      result: toolResult(authorized, relay.refusal),
    });
  }
  return json({ id: message.id, jsonrpc: "2.0", result: {} });
};

const relayEndpoint = (relay: Relay, init: RequestInit | undefined) => {
  const method = init?.method ?? "GET";
  if (method !== "POST") {
    return new Response(null, { status: method === "GET" ? 405 : 200 });
  }
  const authorized =
    new Headers(init?.headers).get("authorization") === `Bearer ${relay.valid}`;
  if (!authorized && relay.refuses === "http") {
    return json({ error: "invalid_token" }, 401, {
      "www-authenticate": `Bearer resource_metadata="${RESOURCE_METADATA}", error="invalid_token"`,
    });
  }
  const message = JSON.parse(String(init?.body)) as RpcMessage;
  return answer(relay, message, authorized);
};

const fakeFetch =
  (relay: Relay) =>
  async (input: string | URL | Request, init?: RequestInit) => {
    await Promise.resolve();
    const url = new URL(input instanceof Request ? input.url : input);
    const href = `${url.origin}${url.pathname}`;
    if (href === RESOURCE_METADATA) {
      return json({ authorization_servers: [ISSUER], resource: RELAY });
    }
    if (href === `${ISSUER}/.well-known/oauth-authorization-server`) {
      return json(AUTH_SERVER);
    }
    if (href === `${ISSUER}/token`) {
      relay.refreshes += 1;
      return relay.refresh();
    }
    if (href === RELAY) {
      return relayEndpoint(relay, init);
    }
    return new Response("Not found", { status: 404 });
  };

const memoryGrant = (initial: Grant) => {
  const state = { expired: false, grant: initial };
  const store: GrantStore = {
    expire: async () => {
      await Promise.resolve();
      state.expired = true;
    },
    load: async () => {
      await Promise.resolve();
      return state.expired ? undefined : state.grant;
    },
    save: async (tokens) => {
      await Promise.resolve();
      state.grant = tokens;
      state.expired = false;
    },
  };
  return { state, store };
};

const freshTokens = () =>
  json({
    access_token: "fresh",
    expires_in: HOUR_S,
    refresh_token: "refresh_2",
    token_type: "Bearer",
  });

const setup = (relay: Partial<Relay>, grant: Grant) => {
  const fake: Relay = {
    calls: [],
    refresh: freshTokens,
    refreshes: 0,
    refusal: "fal relay: HTTP 401 invalid_token (access token expired)",
    refuses: "http",
    valid: "fresh",
    ...relay,
  };
  const upstream = createUpstream({
    appUrl: "https://wovain.example",
    fetch: fakeFetch(fake),
    metaAppId: undefined,
    metaAppSecret: undefined,
    metaScope: "ads_read",
    serverUrls: {
      fal: RELAY,
      fourthwall: "https://fourthwall.example/mcp",
      meta: "https://meta.example/mcp",
    },
  });
  const held = memoryGrant(grant);
  const submit = async () =>
    await upstream.session(
      "fal",
      held.store,
      undefined,
      async (call) => await call("submit_job", { endpoint_id: "x" })
    );
  return { fake, held, submit, upstream };
};

const stale: Grant = {
  access_token: "stale",
  expires_at: nowS() - HOUR_S,
  expires_in: HOUR_S,
  refresh_token: "refresh_1",
  token_type: "Bearer",
};

const isReconnectNeeded = (error: unknown) =>
  EvlogError.isEvlogError(error) &&
  error.code === "FAL_RECONNECT_NEEDED" &&
  error.status === 409 &&
  error.message === "Reconnect fal: its sign-in expired";

describe("upstream session", () => {
  it("refreshes an expired grant before using it, and keeps the new one", async () => {
    const { fake, held, submit } = setup({}, stale);

    await expect(submit()).resolves.toEqual({ request_id: "req_1" });

    expect(fake.refreshes).toBe(1);
    expect(fake.calls).toEqual(["submit_job"]);
    expect(held.state.grant.access_token).toBe("fresh");
    expect(held.state.grant.refresh_token).toBe("refresh_2");
    expect(held.state.grant.expires_at).toBeGreaterThan(nowS());
  });

  it("refreshes when a tool says its token expired, then calls it again", async () => {
    // No expiry on file, like a grant saved before expiries were stamped.
    const { expires_at: _unknown, ...legacy } = stale;
    const { fake, held, submit } = setup({ refuses: "tool" }, legacy);

    await expect(submit()).resolves.toEqual({ request_id: "req_1" });

    expect(fake.refreshes).toBe(1);
    expect(fake.calls).toEqual(["submit_job", "submit_job"]);
    expect(held.state.grant.access_token).toBe("fresh");
  });

  it("marks the grant for reconnecting when the provider refuses the refresh", async () => {
    const { fake, held, submit } = setup(
      {
        refresh: () =>
          json(
            { error: "invalid_grant", error_description: "refresh expired" },
            400
          ),
      },
      stale
    );

    await expect(submit()).rejects.toSatisfy(isReconnectNeeded);
    expect(held.state.expired).toBe(true);
    expect(fake.calls).toEqual([]);
  });

  it("throws the tool's own error, and keeps the grant, when the refreshed token is refused too", async () => {
    const { fake, held, submit } = setup(
      { refuses: "tool", valid: "nobody's" },
      { ...stale, expires_at: nowS() + HOUR_S }
    );

    await expect(submit()).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "FAL_FAILED" &&
        error.message.includes("HTTP 401 invalid_token")
    );
    expect(fake.refreshes).toBe(1);
    expect(fake.calls).toEqual(["submit_job", "submit_job"]);
    expect(held.state.expired).toBe(false);
  });

  it("takes a permission error for what it is: no refresh, no retry, no reconnect", async () => {
    const { fake, held, submit } = setup(
      {
        refusal: "(#200) The user is unauthorized for this ad account",
        refuses: "tool",
        valid: "nobody's",
      },
      { ...stale, expires_at: nowS() + HOUR_S }
    );

    await expect(submit()).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) && error.code === "FAL_FAILED"
    );
    expect(fake.refreshes).toBe(0);
    expect(fake.calls).toEqual(["submit_job"]);
    expect(held.state.expired).toBe(false);
  });

  it("marks the grant when a refresh it rotated itself is later refused", async () => {
    let refreshes = 0;
    const { fake, held, submit } = setup(
      {
        // The first refresh rotates the token; the next one is refused.
        refresh: () => {
          refreshes += 1;
          return refreshes === 1
            ? freshTokens()
            : json({ error: "invalid_grant" }, 400);
        },
        refuses: "tool",
        valid: "nobody's",
      },
      stale
    );

    await expect(submit()).rejects.toSatisfy(isReconnectNeeded);
    expect(fake.calls).toEqual(["submit_job"]);
    expect(held.state.grant.refresh_token).toBe("refresh_2");
    expect(held.state.expired).toBe(true);
  });

  it("keeps a grant another session rotated while this refresh was refused", async () => {
    const box: { held?: ReturnType<typeof memoryGrant> } = {};
    const ctx = setup(
      {
        refresh: () => {
          // The other session's refresh saved a new refresh token first.
          if (box.held !== undefined) {
            box.held.state.grant = {
              ...box.held.state.grant,
              access_token: "fresh",
              refresh_token: "refresh_rotated",
            };
          }
          return json({ error: "invalid_grant" }, 400);
        },
      },
      stale
    );
    box.held = ctx.held;

    await expect(ctx.submit()).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) && error.code === "FAL_FAILED"
    );
    expect(ctx.held.state.expired).toBe(false);
    expect(ctx.held.state.grant.refresh_token).toBe("refresh_rotated");
  });
});

describe("upstream connect", () => {
  it("asks for consent even when the merchant already holds a grant", async () => {
    const { fake, held, upstream } = setup({}, stale);

    const { authorizationUrl } = await upstream.startConnect(
      "fal",
      held.store,
      "state_1"
    );

    const url = new URL(authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("state")).toBe("state_1");
    expect(fake.refreshes).toBe(0);
    expect(held.state.grant).toBe(stale);
  });
});
