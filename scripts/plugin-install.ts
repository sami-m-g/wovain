import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

// Installs plugin/ as a personal plugin in the ChatGPT desktop app, per
// https://developers.openai.com/plugins/build/plugins (local marketplace),
// pointed at a wovain server: the hosted one by default, or `--url` (a tunnel
// to `bun run dev`). ChatGPT signs in through wovain's OAuth, so the plugin
// carries no credentials.
const { values } = parseArgs({ options: { url: { type: "string" } } });
const root = path.join(import.meta.dir, "..");
const home = homedir();
const installDir = path.join(home, ".codex", "plugins", "wovain");
const marketplaceFile = path.join(
  home,
  ".agents",
  "plugins",
  "marketplace.json"
);

const marketplaceSchema = z.looseObject({
  interface: z.looseObject({ displayName: z.string() }),
  name: z.string(),
  plugins: z.array(z.looseObject({ name: z.string() })),
});

const mcpSchema = z.looseObject({
  mcpServers: z.object({
    wovain: z.looseObject({ url: z.url() }),
  }),
});

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return undefined;
  }
};

await rm(installDir, { force: true, recursive: true });
await mkdir(path.dirname(installDir), { recursive: true });
await cp(path.join(root, "plugin"), installDir, { recursive: true });

const mcpFile = path.join(installDir, "mcp.json");
const mcp = mcpSchema.parse(await readJson(mcpFile));
const { wovain } = mcp.mcpServers;
if (values.url !== undefined) {
  wovain.url = z.url().parse(values.url);
}
await writeFile(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`);

const existing = marketplaceSchema.safeParse(await readJson(marketplaceFile));
const marketplace = existing.success
  ? existing.data
  : {
      interface: { displayName: "Local plugins" },
      name: "local-plugins",
      plugins: [],
    };
marketplace.plugins = [
  ...marketplace.plugins.filter((plugin) => plugin.name !== "wovain"),
  {
    category: "Productivity",
    name: "wovain",
    policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
    source: { path: "./.codex/plugins/wovain", source: "local" },
  },
];
await mkdir(path.dirname(marketplaceFile), { recursive: true });
await writeFile(marketplaceFile, `${JSON.stringify(marketplace, null, 2)}\n`);

// The app runs a cached copy and keeps it while the version is unchanged, so
// drop wovain's cache entry; the app rebuilds it from the copy above.
await rm(
  path.join(home, ".codex", "plugins", "cache", marketplace.name, "wovain"),
  {
    force: true,
    recursive: true,
  }
);

console.info(`Installed to ${installDir}, using ${wovain.url}
Marketplace "${marketplace.name}" updated at ${marketplaceFile}

Next: quit and reopen the ChatGPT desktop app, open Plugins → Personal,
pick "${marketplace.interface.displayName}" and click + on wovain, then start a new chat.`);
