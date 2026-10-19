import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";

const jsPlugins = selectJsPlugins(["react-doctor"]);

// Vitest rules live in apps/cards only; the server tests run on `bun test`.
export default defineConfig({
  env: core.env,
  extends: [core, react, jsPlugins],
  ignorePatterns: [
    ...core.ignorePatterns,
    "devpost/**",
    ".agents/skills/**",
    ".claude/skills/**",
  ],
  jsPlugins: jsPlugins.jsPlugins,
  options: { typeAware: true },
  settings: jsPluginSettings,
});
