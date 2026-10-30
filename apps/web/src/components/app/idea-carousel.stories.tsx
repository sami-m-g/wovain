import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { IdeaCarousel } from "@/components/app/idea-carousel";

const ideas = [
  "Moth and moon line-art crest",
  "Balcony tomato club tee",
  "Night-market neon kanji-free type",
  "Repair café workwear patch",
  "Tide-pool field-guide print",
];

// "What sells now" on the Home: one idea at a time, the arrows or the
// keyboard to move, and where you are ("2 of 5").
const meta = {
  args: {
    items: ideas.map((title) => ({
      key: title,
      node: (
        <article className="border-border bg-card rounded-xl border p-6">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Example card: why it sells, who buys and the competition go here.
          </p>
        </article>
      ),
    })),
    label: "Ideas to sell now, one at a time",
  },
  component: IdeaCarousel,
  title: "Home/Ideas carousel",
} satisfies Meta<typeof IdeaCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

const movesOneAtATime: Story["play"] = async ({ canvas }) => {
  await expect(
    canvas.getByRole("region", { name: "Ideas to sell now, one at a time" })
  ).toBeVisible();
  await expect(canvas.getByText("1 of 5")).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: "Previous idea" })
  ).toBeDisabled();
  await userEvent.click(canvas.getByRole("button", { name: "Next idea" }));
  await waitFor(async () => {
    await expect(canvas.getByText("2 of 5")).toBeVisible();
  });
  // The keyboard arrows move too.
  await userEvent.keyboard("{ArrowRight}");
  await waitFor(async () => {
    await expect(canvas.getByText("3 of 5")).toBeVisible();
  });
};

export const Desktop: Story = {
  globals: { viewport: { isRotated: false, value: "desktop" } },
  play: movesOneAtATime,
};

export const Mobile: Story = {
  globals: { viewport: { isRotated: false, value: "mobile1" } },
  play: movesOneAtATime,
};
