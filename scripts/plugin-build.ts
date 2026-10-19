import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

// ChatGPT installs a copy of plugin/, so it must hold everything it runs:
// the server compiled to one binary (no Bun on the app's PATH needed) and the cards.
const root = path.join(import.meta.dir, "..");
const pluginDir = path.join(root, "plugin");

const run = async (cmd: string[]) => {
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`Failed: ${cmd.join(" ")}`);
  }
};

await run(["bun", "run", "build"]);
await rm(path.join(pluginDir, "bin"), { force: true, recursive: true });
await rm(path.join(pluginDir, "cards"), { force: true, recursive: true });
await mkdir(path.join(pluginDir, "bin"), { recursive: true });
await run([
  "bun",
  "build",
  "apps/server/src/index.ts",
  "--compile",
  "--minify",
  "--outfile",
  path.join(pluginDir, "bin", "wovain-server"),
]);
// ffmpeg burns captions into the ad videos; the compiled server can't run a
// binary from inside itself, so the plugin carries its own copy.
const { default: ffmpeg } = await import("ffmpeg-static");
if (ffmpeg === null) {
  throw new Error("ffmpeg-static has no binary for this platform");
}
await cp(ffmpeg, path.join(pluginDir, "bin", "ffmpeg"));
await cp(
  path.join(root, "apps", "cards", "dist"),
  path.join(pluginDir, "cards"),
  {
    recursive: true,
  }
);
console.info("Built plugin/ (bin/wovain-server, cards/)");
