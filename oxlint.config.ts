import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";

const jsPlugins = selectJsPlugins(["react-doctor"]);

// One config for the repo: server tests run on `bun test`, and the cards have
// no unit tests, so no Vitest rules.
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
