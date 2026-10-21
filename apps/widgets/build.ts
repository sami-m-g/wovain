import { rm } from "node:fs/promises";
import path from "node:path";

// Mirrors widgetNames in apps/server/src/widgets.ts.
const widgets = ["settings", "design", "ad", "campaign"];
// --watch rebuilds a widget on save (bun run widgets:watch); the server reads the
// HTML on every request, so the next redraw in ChatGPT shows the change.
const watch = process.argv.includes("--watch");

const buildWidget = async (widget: string) => {
  const args = ["bunx", "vite", "build", "--logLevel", "warn"];
  const proc = Bun.spawn(watch ? [...args, "--watch"] : args, {
    cwd: import.meta.dir,
    env: { ...process.env, WIDGET: widget },
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
};

if (!watch) {
  await rm(path.join(import.meta.dir, "dist"), {
    force: true,
    recursive: true,
  });
}
const codes = await Promise.all(widgets.map(buildWidget));
if (codes.some((code) => code !== 0)) {
  process.exit(1);
}
