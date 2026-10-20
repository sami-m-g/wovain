import { describe, expect, test } from "bun:test";

import { loadEnv } from "../src/env.ts";
import { createHttpFetch } from "../src/http.ts";
import { createStore } from "../src/store.ts";
import { tempDir } from "./helpers.ts";

const token = "t".repeat(32);
const env = loadEnv({ WOVAIN_HTTP_ALLOWED_HOSTS: "wovain.ngrok.app" });
const store = createStore(await tempDir());
const httpFetch = createHttpFetch(env, store, token);

const initialize = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:8787/mcp", {
    body: JSON.stringify({
      id: 0,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
        protocolVersion: "2025-06-18",
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });

describe("HTTP mode", () => {
  test("rejects a request without the bearer token", async () => {
    const response = await httpFetch(initialize({ host: "127.0.0.1:8787" }));
    expect(response.status).toBe(401);
  });

  test("rejects a wrong token", async () => {
    const response = await httpFetch(
      initialize({ authorization: "Bearer nope", host: "127.0.0.1:8787" })
    );
    expect(response.status).toBe(401);
  });

  test("rejects a host outside the allowlist (DNS rebinding)", async () => {
    const response = await httpFetch(
      initialize({ authorization: `Bearer ${token}`, host: "evil.example" })
    );
    expect(response.status).toBe(403);
  });

  test("serves localhost and the allowed tunnel host with the token", async () => {
    const responses = await Promise.all(
      ["127.0.0.1:8787", "wovain.ngrok.app"].map(
        async (host) =>
          await httpFetch(
            initialize({ authorization: `Bearer ${token}`, host })
          )
      )
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });
});
