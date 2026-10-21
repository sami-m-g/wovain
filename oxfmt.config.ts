import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Owned elsewhere: course skills (upstream) and
// CHANGELOG.md (written by semantic-release).
const owned = [".agents/skills/**", ".claude/skills/**", "CHANGELOG.md"];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...owned],
});
