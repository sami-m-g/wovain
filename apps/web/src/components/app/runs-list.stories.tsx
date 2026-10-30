import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { RunsTable } from "@/components/app/runs-list";
import type { Run } from "@/lib/flow-client";

import { rpc } from "../../../.storybook/rpc";

const run = (
  id: string,
  seed: string,
  status: Run["status"],
  step: string | null
): Run => ({
  autopilot: id === "run_2",
  createdAt: new Date("2026-10-20T09:30:00Z"),
  engine: "mastra",
  error: null,
  id,
  seed,
  status,
  step,
  updatedAt: new Date("2026-10-20T09:45:00Z"),
  userId: "user_1",
});

// The drops page (/dashboard/drops): every drop as a row.
const meta = {
  component: RunsTable,
  title: "Drops/Drops table",
} satisfies Meta<typeof RunsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDrops: Story = {
  beforeEach: ({ msw }) => {
    msw.use(
      rpc("runs/list", [
        run(
          "run_1",
          "Moss-dyed workwear for city cyclists",
          "running",
          "design"
        ),
        run("run_2", "Tide-pool prints for surf shops", "completed", "publish"),
        run("run_3", "Night-market neon tees", "failed", "research"),
      ])
    );
  },
  play: async ({ canvas }) => {
    const [failed] = await canvas.findAllByText("Night-market neon tees");
    await expect(failed).toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: ({ msw }) => {
    msw.use(rpc("runs/list", []));
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No drops yet")).toBeVisible();
  },
};
