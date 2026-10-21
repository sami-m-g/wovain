import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Planning docs and course skills are owned elsewhere (course skills, upstream).
const owned = ["devpost/**", ".agents/skills/**", ".claude/skills/**"];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...owned],
});
