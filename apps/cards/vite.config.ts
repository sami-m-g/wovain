import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained HTML file per card: build.ts runs this once per CARD.
const card = process.env["CARD"] ?? "settings";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "../../dist",
    rolldownOptions: { input: `src/${card}/${card}.html` },
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  root: `src/${card}`,
});
