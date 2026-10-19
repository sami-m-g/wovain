import "../src/styles.css";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonThemes, { withThemeByDataAttribute } from "@storybook/addon-themes";
import { definePreview } from "@storybook/react-vite";

// Cards render inside ChatGPT's message column; this frame mimics its width and surface.
export default definePreview({
  addons: [addonDocs(), addonA11y(), addonThemes()],
  decorators: [
    withThemeByDataAttribute({
      attributeName: "data-theme",
      defaultTheme: "light",
      parentSelector: "html",
      themes: { dark: "dark", light: "light" },
    }),
    (Story) => (
      <div className="border-default bg-surface max-w-[720px] rounded-2xl border">
        <Story />
      </div>
    ),
  ],
  parameters: { a11y: { test: "error" }, layout: "padded" },
});
