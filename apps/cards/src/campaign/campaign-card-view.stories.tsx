import type { Campaign } from "@wovain-foss/shared/campaign";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { CampaignCardView } from "./campaign-card-view.tsx";

// The PRD's demo tee as one product with two ads; thresholds at a $10.32 breakeven.
const campaign: Campaign = {
  blockers: [],
  campaignId: "120200000000000",
  dailyBudget: 15,
  products: [{ ads: 2, designId: "d1", title: "Japanese Cat Sunset Tee" }],
  rules: [
    {
      created: true,
      detail: "Pause an ad at $30.96 spend with no sales",
      label: "Kill, no sales",
    },
    {
      created: true,
      detail: "Pause the product at $41.28 spend with no sales",
      label: "Kill, design",
    },
    {
      created: true,
      detail: "Pause an ad above $15.48 a sale after 5 sales in 7 days",
      label: "Kill, too expensive",
    },
    {
      created: true,
      detail:
        "Budget +20% under $8.26 a sale (10+ sales, 3 days), up to $30.00 a day",
      label: "Scale",
    },
    {
      created: true,
      detail: "Tell you when a sale costs more than $10.32, daily",
      label: "Alert",
    },
  ],
  status: "ready",
};

const meta = preview.meta({
  args: {
    campaign,
    onLaunch: fn(async () => {
      await Promise.resolve();
    }),
    onOpen: fn(async () => {
      await Promise.resolve();
    }),
    onRecheck: fn(async () => {
      await Promise.resolve();
    }),
  },
  component: CampaignCardView,
  title: "Cards/Campaign",
});

export const Ready = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Ready to launch")).toBeVisible();
    await expect(
      canvas.getByText("Pause an ad at $30.96 spend with no sales")
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Launch at $15.00 a day" })
    );
    await expect(args.onLaunch).toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "Launching…" })
    ).toBeDisabled();
  },
});

export const Live = meta.story({
  args: {
    campaign: {
      ...campaign,
      adsManagerUrl:
        "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1&selected_campaign_ids=120200000000000",
      status: "live",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Live")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open in Ads Manager" })
    );
    await expect(args.onOpen).toHaveBeenCalled();
  },
});

// prd.md > States and Boundaries #8: no payment method, rules not created yet.
export const Blocked = meta.story({
  args: {
    campaign: {
      ...campaign,
      blockers: [
        {
          fix: "Add a payment method in Meta Billing, then check again.",
          issue: "No payment method on the ad account",
          url: "https://business.facebook.com/billing_hub/payment_settings",
        },
      ],
      rules: campaign.rules.map((rule) => ({ ...rule, created: false })),
      status: "blocked",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Ready, blocked")).toBeVisible();
    await expect(canvas.getAllByText("· not created yet")).toHaveLength(5);
    await userEvent.click(
      canvas.getByRole("button", { name: "I fixed it, check again" })
    );
    await expect(args.onRecheck).toHaveBeenCalled();
  },
});
