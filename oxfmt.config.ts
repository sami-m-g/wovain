import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import { vendorPatterns } from "./.config/vendor.ts";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...vendorPatterns],
});
