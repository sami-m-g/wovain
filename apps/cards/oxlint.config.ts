import { defineConfig } from "oxlint";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

import root from "../../oxlint.config.ts";

// Oxlint lints each file with its nearest config alone, so this extends the
// root config and repeats the properties that extends doesn't carry over.
export default defineConfig({
  env: root.env,
  extends: [root, react, vitest],
  ignorePatterns: root.ignorePatterns,
  settings: root.settings,
});
