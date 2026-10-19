import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],
  core: { disableTelemetry: true },
  // The card build's vite.config.ts is single-file per card; Storybook needs a plain one.
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  stories: ["../src/**/*.stories.tsx"],
});
