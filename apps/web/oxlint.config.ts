import { defineConfig } from "oxlint";
import next from "ultracite/oxlint/next";
import nextJsPlugins from "ultracite/oxlint/next/js-plugins";

import root from "../../oxlint.config.ts";

// Oxlint lints each file with its nearest config alone, so this extends the
// root config and repeats the properties that extends doesn't carry over
// (ultracite.ai/docs/monorepos).
export default defineConfig({
  env: root.env,
  extends: [root, next, nextJsPlugins],
  ignorePatterns: root.ignorePatterns,
  jsPlugins: root.jsPlugins,
  settings: root.settings,
});
