import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { BriefStep } from "@/components/app/wizard-steps";

// The drop's first step: the brief box first, starters that only fill it,
// a link back to the researched ideas on the Home, and one primary button.
// With no kept suggestions (the procedure answers 404 here) the starters
// are the fixed examples.
const meta = {
  args: {
    autopilot: false,
    brief: "",
    budget: "15",
    budgetInvalid: false,
    onBudget: fn(),
    onChange: fn(),
    onSubmit: fn(),
  },
  component: BriefStep,
  title: "Drops/Brief step",
} satisfies Meta<typeof BriefStep>;

export default meta;
type Story = StoryObj<typeof meta>;

const starterFillsTheBox: Story["play"] = async ({ args, canvas }) => {
  const starter = await canvas.findByRole("button", {
    name: "Line-art tees for balcony gardeners",
  });
  await userEvent.click(starter);
  await expect(args.onChange).toHaveBeenCalledWith(
    "Line-art tees for balcony gardeners"
  );
  // A starter never starts the drop.
  await expect(args.onSubmit).not.toHaveBeenCalled();
  await expect(
    canvas.getByRole("link", { name: /Pick a researched idea/u })
  ).toBeVisible();
  await expect(
    canvas.getAllByRole("button", { name: "Research trends" })
  ).toHaveLength(1);
};

export const Desktop: Story = {
  globals: { viewport: { isRotated: false, value: "desktop" } },
  play: starterFillsTheBox,
};

export const Mobile: Story = {
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: starterFillsTheBox,
};
