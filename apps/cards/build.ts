import { rm } from "node:fs/promises";
import path from "node:path";

// Mirrors cardNames in apps/server/src/cards.ts.
const cards = ["settings", "design"];
// --watch rebuilds a card on save (bun run cards:watch); the server reads the
// HTML on every request, so the next redraw in ChatGPT shows the change.
const watch = process.argv.includes("--watch");

const buildCard = async (card: string) => {
  const args = ["bunx", "vite", "build", "--logLevel", "warn"];
  const proc = Bun.spawn(watch ? [...args, "--watch"] : args, {
    cwd: import.meta.dir,
    env: { ...process.env, CARD: card },
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
const codes = await Promise.all(cards.map(buildCard));
if (codes.some((code) => code !== 0)) {
  process.exit(1);
}
