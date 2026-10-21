import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained HTML file per widget: build.ts runs this once per WIDGET.
const widget = process.env["WIDGET"] ?? "settings";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "../../dist",
    rolldownOptions: { input: `src/${widget}/${widget}.html` },
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  root: `src/${widget}`,
});
