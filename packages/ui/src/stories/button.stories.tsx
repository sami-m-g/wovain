import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@wovain/ui/components/button";
import { expect, fn, userEvent } from "storybook/test";

const meta = {
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "default", "lg"] },
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
  },
  args: { children: "See designs", onClick: fn() },
  component: Button,
  title: "UI/Button",
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "See designs" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Outline: Story = { args: { variant: "outline" } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("button")).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
