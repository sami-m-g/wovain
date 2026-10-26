import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import { vendorPatterns } from "./.config/vendor.ts";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ...vendorPatterns,
    // Written back to main by the AI Catalog sync job (.gitlab/ci/duo.yml).
    ".gitlab/duo/catalog/mapping.json",
  ],
});
