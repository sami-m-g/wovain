import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const vendorPatterns = [
  ".agents/**",
  ".claude/skills/**",
  "apps/fumadocs/src/components/ai/**",
  "apps/fumadocs/src/components/codeblock.tsx",
  "apps/fumadocs/src/components/tabs/**",
  "apps/fumadocs/src/components/ui/**",
  "apps/fumadocs/src/lib/cn.ts",
  "apps/fumadocs/src/lib/merge-refs.ts",
  "packages/db/src/migrations/**",
  "packages/db/src/schema/auth.ts",
  "packages/ui/src/components/**",
  "packages/ui/src/hooks/**",
  "packages/ui/src/lib/**",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...vendorPatterns],
});
