import { rm } from "node:fs/promises";
import path from "node:path";

// Mirrors cardNames in apps/server/src/cards.ts.
const cards = ["settings"];

const buildCard = async (card: string) => {
  const proc = Bun.spawn(["bunx", "vite", "build", "--logLevel", "warn"], {
    cwd: import.meta.dir,
    env: { ...process.env, CARD: card },
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
};

await rm(path.join(import.meta.dir, "dist"), { force: true, recursive: true });
const codes = await Promise.all(cards.map(buildCard));
if (codes.some((code) => code !== 0)) {
  process.exit(1);
}
