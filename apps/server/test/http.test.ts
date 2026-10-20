import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";

import { loadEnv } from "../src/env.ts";
import { createHttpFetch } from "../src/http.ts";
import { createStore } from "../src/store.ts";
import { tempDir } from "./helpers.ts";

const token = "t".repeat(32);
const url = "https://wovain.example/mcp";
const settingsCard = "ui://wovain/settings-v3.html";
const cardsDir = path.join(import.meta.dir, "..", "..", "cards", "dist");
const cardsBuilt = await Bun.file(
  path.join(cardsDir, "settings.html")
).exists();

const httpFetch = createHttpFetch(
  loadEnv({ WOVAIN_CARDS_DIR: cardsDir, WOVAIN_HTTP_TOKEN: token }),
  createStore(await tempDir())
);

const initialize = (headers: Record<string, string>) =>
  new Request(url, {
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

describe("bearer token", () => {
  test("rejects a request without the token", async () => {
    const response = await httpFetch(initialize({}));
    expect(response.status).toBe(401);
  });

  test("rejects a wrong token", async () => {
    const response = await httpFetch(
      initialize({ authorization: "Bearer nope" })
    );
    expect(response.status).toBe(401);
  });

  test("serves nothing when no token is configured", async () => {
    const open = createHttpFetch(loadEnv({}), createStore(await tempDir()));
    const response = await open(initialize({ authorization: "Bearer " }));
    expect(response.status).toBe(401);
  });
});

// A real MCP client over Streamable HTTP, the way ChatGPT connects.
describe("over HTTP", () => {
  const client = new Client({ name: "wovain-test", version: "0.0.0" });

  beforeAll(async () => {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        fetch: async (input, init) => await httpFetch(new Request(input, init)),
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      })
    );
  });

  afterAll(async () => {
    await client.close();
  });

  test("lists the settings tools and the settings card resource", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of [
      "get_settings",
      "update_settings",
      "show_settings_card",
    ]) {
      expect(names).toContain(name);
    }
    const card = tools.find((tool) => tool.name === "show_settings_card");
    expect(card?._meta?.["ui"]).toMatchObject({ resourceUri: settingsCard });

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain(settingsCard);
  });

  test("update_settings then get_settings round-trips", async () => {
    const updated = await client.callTool({
      arguments: { patch: { campaign: { dailyBudgetPerProduct: 20 } } },
      name: "update_settings",
    });
    expect(updated.isError).toBeFalsy();
    const read = await client.callTool({ arguments: {}, name: "get_settings" });
    expect(read.structuredContent).toMatchObject({
      settings: { campaign: { dailyBudgetPerProduct: 20 } },
    });
  });

  test.skipIf(!cardsBuilt)(
    "serves the built settings card as an MCP App",
    async () => {
      const { contents } = await client.readResource({ uri: settingsCard });
      const [card] = contents;
      expect(card?.mimeType).toBe("text/html;profile=mcp-app");
      // Mockups load from Fourthwall's CDN only if the card declares it.
      const ui = z
        .object({ csp: z.object({ resourceDomains: z.array(z.string()) }) })
        .parse(card?._meta?.["ui"]);
      expect(ui.csp.resourceDomains).toContain("https://cdn.fourthwall.com");
      // Finished ad clips are served from v3b.fal.media.
      expect(ui.csp.resourceDomains).toContain("https://v3b.fal.media");
      expect(card && "text" in card ? card.text : "").toContain(
        "<!doctype html>"
      );
    }
  );
});
