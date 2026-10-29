import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { HeroDemo } from "@/components/marketing/hero-demo";

// The home page's hero: the app making a drop, on a loop.
const meta = {
  args: {
    tag: {
      baseCost: 12,
      cardFees: 1.42,
      marginPct: 57,
      price: 28,
      profit: 11.9,
      refundReserve: 0.84,
    },
  },
  component: HeroDemo,
  parameters: { layout: "padded" },
  title: "Home/Hero demo",
} satisfies Meta<typeof HeroDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("figure")).toBeInTheDocument();
  },
};
