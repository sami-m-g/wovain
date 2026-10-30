import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { StoreSetup } from "@/components/store/store-setup";
import type { StoreSetup as Setup } from "@/lib/flow-client";

import { rpc } from "../../../.storybook/rpc";

const setup = (steps: Setup["steps"]): Setup => ({
  domain: null,
  metaConnected: true,
  pixel: null,
  pixelAutomation: false,
  shop: {
    baseUrl: "https://loom-and-thread.fourthwall.com",
    hosts: ["loom-and-thread.fourthwall.com"],
    name: "Loom & Thread",
    payoutStatus: null,
    siteStatus: "LIVE",
  },
  steps,
});

const meta = {
  component: StoreSetup,
  title: "Store/Setup checklist",
} satisfies Meta<typeof StoreSetup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  beforeEach: ({ msw }) => {
    msw.use(
      rpc(
        "store/setup",
        setup([
          { how: "none", id: "connect", required: true, state: "done" },
          { how: "none", id: "site_live", required: true, state: "done" },
          { how: "link", id: "payouts", required: true, state: "todo" },
          { how: "none", id: "domain", required: false, state: "waiting" },
        ])
      )
    );
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("2 of 4 done")).toBeVisible();
    const toggle = canvas.getByRole("button", { name: "Hide steps" });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

export const Ready: Story = {
  beforeEach: ({ msw }) => {
    msw.use(
      rpc(
        "store/setup",
        setup([
          { how: "none", id: "connect", required: true, state: "done" },
          { how: "none", id: "site_live", required: true, state: "done" },
        ])
      )
    );
  },
};
