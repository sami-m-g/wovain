import { createHash, randomUUID } from "node:crypto";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { z } from "zod";

import { nonceHashOf, providers } from "../src/lib/connections.ts";
import type { ProviderId } from "../src/lib/connections.ts";
import type { Upstream } from "../src/lib/upstream.ts";

// A stand-in for Fourthwall's, fal's or Meta's MCP server and its
// authorization server, reached through an injected fetch: protected-resource
// and AS metadata (with CIMD, except Meta's), a token endpoint that checks
// PKCE and rotates refresh tokens, and an MCP endpoint that wants a bearer
// token. The SDK's real client code runs against it.
export const fakeUpstream = (
  id: ProviderId,
  options: { expiresIn?: number } = {}
) => {
  const cimd = id !== "meta";
  const server = new URL(providers[id].serverUrl);
  const issuer = "https://auth.upstream.test";
  const codes = new Map<string, { challenge: string; user: string }>();
  // Each access token's owner, for the browser sign-in tests.
  const accessTokens = new Map<string, string>();
  const refreshTokens = new Set<string>();
  const calls: { name: string; arguments: unknown }[] = [];
  // The client_id each token request came with.
  const tokenClients: string[] = [];
  const stats = { refreshes: 0 };
  const mode = { loginNeeded: false };
  // What a tool answers instead of { ok: true }.
  const replies = new Map<string, Record<string, unknown>>();

  const issue = (user: string) => {
    const access = `at-${randomUUID()}`;
    const refresh = `rt-${randomUUID()}`;
    accessTokens.set(access, user);
    refreshTokens.add(refresh);
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      ...(options.expiresIn === undefined
        ? {}
        : { expires_in: options.expiresIn }),
    };
  };

  const mcpServer = () => {
    const mcp = new McpServer({ name: "fake", version: "0" });
    for (const name of [
      "ecommerce_get-current-shop",
      "check_account_status",
      "submit_jobs",
      "ads_get_ad_accounts",
      "ads_create_campaign",
      "ads_create_ad_set",
      "ads_activate_entity",
      "ads_get_ad_entities",
      "ads_create_creative",
      "ads_creative_upload_media",
    ]) {
      mcp.registerTool(
        name,
        { inputSchema: z.looseObject({}) },
        (args: Record<string, unknown>) => {
          calls.push({ arguments: args, name });
          return mode.loginNeeded
            ? {
                _meta: { "mcp/www_authenticate": ["Bearer"] },
                content: [{ text: "Sign in required", type: "text" as const }],
                isError: true,
              }
            : {
                content: [{ text: `${name} ok`, type: "text" as const }],
                structuredContent: replies.get(name) ?? { ok: true },
              };
        }
      );
    }
    return mcp;
  };
  const handler = createMcpHandler(mcpServer);

  const app = new Hono();
  const resourceMetadata = {
    authorization_servers: [issuer],
    resource: server.href,
    scopes_supported: ["openid", "offline_access"],
  };
  app.get("/.well-known/oauth-protected-resource", (c) =>
    c.json(resourceMetadata)
  );
  app.get(`/.well-known/oauth-protected-resource${server.pathname}`, (c) =>
    c.json(resourceMetadata)
  );
  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json({
      authorization_endpoint: `${issuer}/authorize`,
      client_id_metadata_document_supported: cimd,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer,
      response_types_supported: ["code"],
      scopes_supported: cimd ? ["openid", "offline_access"] : ["ads_read"],
      token_endpoint: `${issuer}/token`,
      token_endpoint_auth_methods_supported: ["none"],
    })
  );
  app.post("/token", async (c) => {
    const form = await c.req.formData();
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    tokenClients.push(field("client_id"));
    if (field("grant_type") === "authorization_code") {
      const granted = codes.get(field("code"));
      const verified =
        granted?.challenge ===
        createHash("sha256").update(field("code_verifier")).digest("base64url");
      codes.delete(field("code"));
      return verified
        ? c.json(issue(granted.user))
        : c.json({ error: "invalid_grant" }, 400);
    }
    stats.refreshes += 1;
    const refresh = field("refresh_token");
    if (!refreshTokens.delete(refresh)) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    return c.json(issue("u1"));
  });
  app.all(server.pathname, async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /u, "");
    if (token === undefined || !accessTokens.has(token)) {
      return c.json({ error: "invalid_token" }, 401, {
        "www-authenticate": `Bearer resource_metadata="${server.origin}/.well-known/oauth-protected-resource${server.pathname}"`,
      });
    }
    return await handler.fetch(c.req.raw);
  });

  return {
    // Someone approving on the consent page as `user`: a code bound to the
    // authorization URL's PKCE challenge.
    approve: (authorizationUrl: URL, user = "u1") => {
      const code = `code-${randomUUID()}`;
      codes.set(code, {
        challenge: authorizationUrl.searchParams.get("code_challenge") ?? "",
        user,
      });
      return code;
    },
    calls,
    expireAccessTokens: () => {
      accessTokens.clear();
    },
    fetch: async (input: string | URL | Request, init?: RequestInit) =>
      await app.fetch(new Request(input, init)),
    ownerOf: async (token: string) =>
      await Promise.resolve(accessTokens.get(token)),
    reply: (name: string, structuredContent: Record<string, unknown>) => {
      replies.set(name, structuredContent);
    },
    revokeAll: () => {
      accessTokens.clear();
      refreshTokens.clear();
    },
    setLoginNeeded: (value: boolean) => {
      mode.loginNeeded = value;
    },
    stats,
    tokenClients,
  };
};

type Fake = ReturnType<typeof fakeUpstream>;

// A merchant who already signed in to wovain in this browser authorizes the
// provider: the provider half of the connect flow.
export const connectWith = async (
  upstream: Upstream,
  fake: Fake,
  userId: string,
  id: ProviderId
) => {
  const nonceHash = nonceHashOf("this-browser");
  const authorizationUrl = await upstream.authorize(userId, id, nonceHash);
  if (authorizationUrl === undefined) {
    throw new Error("no authorization URL");
  }
  const connected = await upstream.finishConnect(id, {
    code: fake.approve(authorizationUrl),
    nonceHash,
    state: authorizationUrl.searchParams.get("state") ?? "",
  });
  return { authorizationUrl, connected, nonceHash };
};
