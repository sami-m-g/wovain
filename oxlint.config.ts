import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

import { vendorPatterns } from "./.config/vendor.ts";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...vendorPatterns],
  overrides: [
    // Pulumi declares a resource by constructing it; the object isn't needed.
    {
      files: ["infra/**"],
      rules: {
        "max-classes-per-file": "off",
        "max-lines": "off",
        "no-new": "off",
      },
    },
    // ChatGPT widgets are plain React in a sandboxed iframe, not Next.js.
    {
      files: ["packages/widgets/**"],
      rules: { "nextjs/no-img-element": "off" },
    },
  ],
});
