import type { StorybookConfig } from "@storybook/nextjs-vite";

const JSON_ASSERTION = /\s*assert\s*\{\s*type:\s*["']json["']\s*\}/gu;

// One Storybook for the app and the shared UI (packages/ui), so both render
// with the app's tokens.
const config: StorybookConfig = {
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "msw-storybook-addon",
  ],
  framework: "@storybook/nextjs-vite",
  // MSW's worker script, served from the package instead of a copy in public/.
  staticDirs: [{ from: "../node_modules/msw/lib", to: "/" }],
  stories: [
    "../src/**/*.stories.tsx",
    "../../../packages/ui/src/**/*.stories.tsx",
  ],
  // The framework's SWC step turns `with { type: "json" }` into the old
  // `assert` form (emitAssertForImportAttributes), which browsers reject.
  // Vite serves JSON as a module anyway, so the attribute is dropped.
  viteFinal: (vite) => ({
    ...vite,
    plugins: [
      ...(vite.plugins ?? []),
      {
        enforce: "post",
        name: "drop-json-import-assertions",
        transform: (code) => code.replaceAll(JSON_ASSERTION, ""),
      },
    ],
  }),
};

export default config;
