import { existsSync } from "node:fs";
import path from "node:path";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { loadEnv } from "../../src/env.ts";
import { createMcpFetch } from "../../src/http.ts";
import { testStorage } from "../helpers.ts";

const url = "https://wovain.example/mcp";
const settingsWidget = "ui://wovain/settings-v3.html";
const widgetsDir = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "widgets",
  "dist"
);
const widgetsBuilt = existsSync(path.join(widgetsDir, "settings.html"));

const mcpFetch = createMcpFetch(
  loadEnv({
    WOVAIN_ICON_URL: "https://wovain.example/icon.png",
    WOVAIN_WIDGETS_DIR: widgetsDir,
  }),
  testStorage()
);

// routes/mcp.ts verifies the OAuth token first and passes who it belongs to.
const caller = (userId: string) => ({
  clientId: "chatgpt",
  extra: { userId },
  scopes: [],
  token: "verified-upstream",
});

const connect = async (userId: string) => {
  const client = new Client({ name: "wovain-test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      fetch: async (input, init) =>
        await mcpFetch(new Request(input, init), caller(userId)),
    })
  );
  return client;
};

// A real MCP client over Streamable HTTP, the way ChatGPT connects, once for
// each of two merchants.
describe("over HTTP", () => {
  let client: Client;
  let other: Client;

  beforeAll(async () => {
    client = await connect("alice");
    other = await connect("bob");
  });

  afterAll(async () => {
    await client.close();
    await other.close();
  });

  test("names itself with the wovain logo", () => {
    expect(client.getServerVersion()).toMatchObject({
      icons: [
        { mimeType: "image/png", src: "https://wovain.example/icon.png" },
      ],
      name: "wovain",
    });
  });

  test("lists the settings tools and the settings widget resource", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of [
      "get_settings",
      "update_settings",
      "show_settings_widget",
    ]) {
      expect(names).toContain(name);
    }
    const widget = tools.find((tool) => tool.name === "show_settings_widget");
    expect(widget?._meta?.["ui"]).toMatchObject({
      resourceUri: settingsWidget,
    });

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain(settingsWidget);
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

  test("each merchant sees only their own settings", async () => {
    const read = await other.callTool({ arguments: {}, name: "get_settings" });
    expect(read.structuredContent).toMatchObject({
      settings: { campaign: { dailyBudgetPerProduct: 15 } },
    });
  });

  test("refuses a request with no merchant", async () => {
    const response = await mcpFetch(
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
        },
        method: "POST",
      }),
      caller("")
    );
    expect(response.ok).toBe(false);
  });

  test.skipIf(!widgetsBuilt)(
    "serves the built settings widget as an MCP App",
    async () => {
      const { contents } = await client.readResource({ uri: settingsWidget });
      const [widget] = contents;
      expect(widget?.mimeType).toBe("text/html;profile=mcp-app");
      // Mockups load from Fourthwall's CDN only if the widget declares it.
      const ui = z
        .object({ csp: z.object({ resourceDomains: z.array(z.string()) }) })
        .parse(widget?._meta?.["ui"]);
      expect(ui.csp.resourceDomains).toContain("https://cdn.fourthwall.com");
      // Finished ad clips are served from v3b.fal.media.
      expect(ui.csp.resourceDomains).toContain("https://v3b.fal.media");
      expect(widget && "text" in widget ? widget.text : "").toContain(
        "<!doctype html>"
      );
    }
  );
});
