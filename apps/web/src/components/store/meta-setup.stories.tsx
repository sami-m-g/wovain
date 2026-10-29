import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { MetaSetup } from "@/components/store/meta-setup";
import type { MetaSetup as Setup } from "@/lib/flow-client";

import { rpc } from "../../../.storybook/rpc";

const step = (
  id: Setup["steps"][number]["id"],
  state: Setup["steps"][number]["state"],
  required = true
): Setup["steps"][number] => ({
  altHref: null,
  how: state === "done" ? "none" : "link",
  href:
    state === "done" ? null : "https://business.facebook.com/settings/pages",
  id,
  required,
  state,
});

const meta = {
  component: MetaSetup,
  title: "Store/Meta setup cards",
} satisfies Meta<typeof MetaSetup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  beforeEach: ({ msw }) => {
    msw.use(
      rpc("store/metaSetup", {
        account: null,
        connected: true,
        graph: null,
        needsReconnect: false,
        steps: [
          step("ad_account", "done"),
          step("payment", "done"),
          step("page", "todo"),
          step("instagram", "todo", false),
          step("safety_rules", "check"),
        ],
      } satisfies Setup)
    );
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("2 of 4 done")).toBeVisible();
  },
};

export const NotConnected: Story = {
  beforeEach: ({ msw }) => {
    msw.use(
      rpc("store/metaSetup", {
        account: null,
        connected: false,
        graph: null,
        needsReconnect: false,
        steps: [step("ad_account", "todo")],
      } satisfies Setup)
    );
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Connect Meta" })
    ).toBeVisible();
  },
};
