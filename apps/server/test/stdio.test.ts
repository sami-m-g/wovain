import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { z } from "zod";

const settingsCard = "ui://wovain/settings-v2.html";

// WOVAIN_SERVER_BIN=plugin/bin/wovain-server runs these against the compiled plugin.
const serverBin = process.env["WOVAIN_SERVER_BIN"];
const cardsDir = path.join(import.meta.dir, "..", "..", "cards", "dist");
const cardsBuilt = await Bun.file(
  path.join(cardsDir, "settings.html")
).exists();

// Starts the real server over stdio, the way the ChatGPT desktop app does.
const client = new Client({ name: "wovain-test", version: "0.0.0" });

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
);

beforeAll(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "wovain-"));
  await client.connect(
    new StdioClientTransport({
      args:
        serverBin === undefined
          ? ["run", path.join(import.meta.dir, "..", "src", "index.ts")]
          : [],
      command: serverBin ?? "bun",
      env: {
        ...inheritedEnv,
        WOVAIN_CARDS_DIR: cardsDir,
        WOVAIN_DATA_DIR: dataDir,
      },
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

test("update_settings then get_settings round-trips over stdio", async () => {
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
    expect(card && "text" in card ? card.text : "").toContain(
      "<!doctype html>"
    );
  }
);
