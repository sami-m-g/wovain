import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";

const jsPlugins = selectJsPlugins(["react-doctor"]);

// One config for the repo. Server tests and widget stories run on Vitest, but
// no Vitest rules are enabled yet.
export default defineConfig({
  env: core.env,
  extends: [core, react, jsPlugins],
  ignorePatterns: [...core.ignorePatterns, ".claude/skills/**"],
  jsPlugins: jsPlugins.jsPlugins,
  options: { typeAware: true },
  // Pulumi declares a resource by constructing it; the object isn't needed.
  overrides: [{ files: ["infra/**"], rules: { "no-new": "off" } }],
  settings: jsPluginSettings,
});
