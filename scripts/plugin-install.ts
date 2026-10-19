import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

// Installs plugin/ as a personal desktop-only plugin, per
// https://developers.openai.com/plugins/build/plugins (local marketplace).
// --dev installs a launcher that runs the server from this repo's source and
// serves cards from apps/cards/dist, so card edits need only `bun run cards:watch`
// and a redraw, and server or skill edits need only an app restart.
const dev = process.argv.includes("--dev");
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
  mcpServers: z.record(
    z.string(),
    z.looseObject({ env: z.record(z.string(), z.string()).optional() })
  ),
});

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return undefined;
  }
};

const proc = Bun.spawn(["bun", "run", dev ? "build" : "plugin:build"], {
  cwd: root,
  stdio: ["inherit", "inherit", "inherit"],
});
if ((await proc.exited) !== 0) {
  process.exit(1);
}

await rm(installDir, { force: true, recursive: true });
await mkdir(path.dirname(installDir), { recursive: true });
const builtDirs = new Set(
  ["bin", "cards"].map((dir) => path.join(root, "plugin", dir))
);
await cp(path.join(root, "plugin"), installDir, {
  // Dev mode leaves out the compiled server and copied cards.
  filter: (source) => !(dev && builtDirs.has(source)),
  recursive: true,
});

if (dev) {
  const launcher = path.join(installDir, "bin", "wovain-server");
  await mkdir(path.dirname(launcher), { recursive: true });
  // process.execPath is this Bun: the app's PATH may not include it.
  await writeFile(
    launcher,
    `#!/bin/sh\n# wovain dev launcher (bun run plugin:dev): runs the repo's server source.\nexec "${process.execPath}" run "${path.join(root, "apps", "server", "src", "index.ts")}"\n`
  );
  await chmod(launcher, 0o755);
}

// The app doesn't pass your shell environment, so point the server at the repo's .env.
const mcpFile = path.join(installDir, "mcp.json");
const mcp = mcpSchema.parse(await readJson(mcpFile));
const { wovain } = mcp.mcpServers;
if (wovain !== undefined) {
  wovain.env = {
    ...wovain.env,
    WOVAIN_ENV_FILE: path.join(root, ".env"),
    ...(dev && { WOVAIN_CARDS_DIR: path.join(root, "apps", "cards", "dist") }),
  };
  // Dev mode runs the source, which finds ffmpeg-static itself.
  if (dev) {
    delete wovain.env["WOVAIN_FFMPEG"];
  }
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

console.info(`Installed${dev ? " in dev mode" : ""} to ${installDir}
Marketplace "${marketplace.name}" updated at ${marketplaceFile}

Next: quit and reopen the ChatGPT desktop app, open Plugins → Personal,
pick "${marketplace.interface.displayName}" and click + on wovain, then start a new chat.`);
