import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

import { widgetNames } from "./src/names.ts";

// Builds each widget into one self-contained HTML document (the host loads it
// in a sandboxed iframe), then writes them into dist/html.js for the MCP
// server: esbuild bundles the React code, Tailwind compiles the UI kit's
// styles, and both are inlined.

const root = import.meta.dirname;
const dist = path.join(root, "dist");
const stylesPath = path.join(root, "src", "styles.css");

const { css } = await postcss([
  tailwindcss({ base: root, optimize: true }),
]).process(await readFile(stylesPath, "utf-8"), { from: stylesPath });

const bundle = async (name: string) => {
  const { outputFiles } = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: [path.join(root, "src", `${name}.tsx`)],
    format: "esm",
    jsx: "automatic",
    minify: true,
    platform: "browser",
    write: false,
  });
  return outputFiles.map((file) => file.text).join("\n");
};

// "</script" inside the bundle would end the inline script early.
const page = (name: string, js: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>wovain ${name}</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll("</script", "<\\/script")}</script></body></html>`;

const pages = Object.fromEntries(
  await Promise.all(
    widgetNames.map(async (name) => [name, page(name, await bundle(name))])
  )
);

await mkdir(dist, { recursive: true });
await writeFile(
  path.join(dist, "html.js"),
  `export const widgetHtml = ${JSON.stringify(pages)};\n`
);
await writeFile(
  path.join(dist, "html.d.ts"),
  `export declare const widgetHtml: Record<${widgetNames.map((name) => JSON.stringify(name)).join(" | ")}, string>;\n`
);
