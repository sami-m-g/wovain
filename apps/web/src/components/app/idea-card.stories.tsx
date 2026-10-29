import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { IdeasStep } from "@/components/app/wizard-steps";
import type { Idea } from "@/lib/flow-client";

const idea: Idea = {
  avoidNames: [],
  competition: null,
  createdAt: new Date("2026-10-20T09:30:00Z"),
  id: "idea_1",
  rank: 1,
  research: {
    moment: "Repair cafés are trending as cities add bike lanes this autumn.",
    rank: 1,
    references: [],
    score: 0.82,
    signals: {
      affinity: 0.74,
      ipSafety: 1,
      margin: 0.6,
      marketHits: 41,
      newsHits: 12,
      recency: 0.8,
      relevance: 0.7,
    },
    sources: [{ title: "City cycling report", url: "https://example.com/" }],
    theme: "Moss-dyed workwear",
  },
  runId: "run_1",
  score: 0.82,
  seed: "workwear for city cyclists",
  style: null,
  theme: "Moss-dyed workwear",
  userId: "user_1",
  whoBuys: null,
};

// The ideas step of a drop: each idea a card the merchant picks.
const meta = {
  args: {
    designedIdeaIds: [],
    ideas: [idea],
    onNext: fn(),
    onToggle: fn(),
    picked: [],
  },
  component: IdeasStep,
  // The card's panel headings skip h3 (#229); on again once that is fixed.
  parameters: {
    a11y: { config: { rules: [{ enabled: false, id: "heading-order" }] } },
  },
  title: "Drops/Idea card",
} satisfies Meta<typeof IdeasStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unpicked: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox"));
    await expect(args.onToggle).toHaveBeenCalledWith("idea_1", true);
  },
};

export const Designed: Story = {
  args: { designedIdeaIds: ["idea_1"] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Design ready")).toBeVisible();
  },
};
