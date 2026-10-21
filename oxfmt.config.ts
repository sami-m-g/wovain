import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Owned elsewhere: planning docs and course skills (upstream), and
// CHANGELOG.md (written by semantic-release).
const owned = [
  "devpost/**",
  ".agents/skills/**",
  ".claude/skills/**",
  "CHANGELOG.md",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...owned],
});
