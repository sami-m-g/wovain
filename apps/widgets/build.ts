import { rm } from "node:fs/promises";
import path from "node:path";

import { build } from "vite";

// Mirrors widgetNames in apps/server/src/widgets.ts.
const widgets = ["settings", "design", "ad", "campaign"];
// --watch rebuilds a widget on save (pnpm widgets:watch); the server reads the
// HTML on every request, so the next redraw in ChatGPT shows the change.
const watch = process.argv.includes("--watch");

if (!watch) {
  await rm(path.join(import.meta.dirname, "dist"), {
    force: true,
    recursive: true,
  });
}
// vite.config.ts reads WIDGET when each build loads it, so they run in turn.
for (const widget of widgets) {
  process.env["WIDGET"] = widget;
  // oxlint-disable-next-line react-doctor/async-await-in-loop, no-await-in-loop -- each build reads WIDGET at load
  await build({
    build: watch ? { watch: {} } : {},
    configFile: path.join(import.meta.dirname, "vite.config.ts"),
    logLevel: "warn",
  });
}
