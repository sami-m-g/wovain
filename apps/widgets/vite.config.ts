import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained HTML file per widget: build.ts runs this once per WIDGET.
const widget = process.env["WIDGET"] ?? "settings";
const component = `${widget.charAt(0).toUpperCase()}${widget.slice(1)}Widget`;
const virtualId = "\0virtual:widget";

// Shares one index.html and main.tsx: virtual:widget re-exports this widget's
// component, and the page is written as <widget>.html for the server to find.
const widgetEntry = (): Plugin => ({
  enforce: "post",
  generateBundle(_options, bundle) {
    const page = bundle["index.html"];
    if (page !== undefined) {
      page.fileName = `${widget}.html`;
    }
  },
  load: (id) =>
    id === virtualId
      ? `export { ${component} as Widget } from ${JSON.stringify(
          path.join(import.meta.dirname, "src", widget, `${widget}-widget.tsx`)
        )};`
      : undefined,
  name: "wovain-widget-entry",
  resolveId: (id) => (id === "virtual:widget" ? virtualId : undefined),
  transformIndexHtml: (html) => html.replace("%WIDGET%", widget),
});

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "../dist",
    rolldownOptions: { input: "src/index.html" },
  },
  plugins: [react(), tailwindcss(), viteSingleFile(), widgetEntry()],
  root: "src",
});
