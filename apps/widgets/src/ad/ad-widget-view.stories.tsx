import type { Ad } from "@wovain/shared/ad";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { AdWidgetView } from "./ad-widget-view.tsx";

// Synthetic ad for Storybook: the PRD's demo tee; videos and mockup are placeholders.
const ad: Ad = {
  coach: "Two try-on clips plus your mockup. Good margin for a test.",
  designId: "d1",
  economics: {
    baseCost: 17.7,
    breakevenPerSale: 10.32,
    cardFees: 1.38,
    price: 30,
    refundReserve: 0.6,
    roas: 2.9,
    roasOnOrderValue: 3.6,
  },
  headline: "Sakura Season Cat Tee",
  primaryText:
    "A calico watches the sun sink behind Mount Fuji. Soft, vintage-washed colors on a bestseller tee.",
  productTitle: "Japanese Cat Sunset Tee",
  rules: {
    alertAbove: 10.32,
    killDesignAt: 41.28,
    killExpensiveAbove: 15.48,
    killNoSalesAt: 30.96,
    scaleStepPct: 20,
    scaleUnder: 8.26,
  },
  staticImage: {
    alt: "Black tee with the cat sunset print",
    url: "/mockups/tee-black.svg",
  },
  status: "draft",
  videos: [
    {
      angle: "UGC on-model",
      seconds: 15,
      slot: "A",
      status: "ready",
      url: "/videos/ugc-A.mp4",
    },
    {
      angle: "UGC styling",
      seconds: 15,
      slot: "B",
      status: "ready",
      url: "/videos/ugc-B.mp4",
    },
  ],
};

const meta = preview.meta({
  args: {
    ad,
    onAdd: fn(
      async (current: Ad) =>
        await Promise.resolve({ ...current, status: "added" as const })
    ),
    onFeedback: fn(async () => {
      await Promise.resolve();
    }),
    onFullscreen: fn(async () => {
      await Promise.resolve();
    }),
    onRetry: fn(async () => {
      await Promise.resolve();
    }),
    onSkip: fn(
      async (current: Ad) =>
        await Promise.resolve({ ...current, status: "skipped" as const })
    ),
  },
  component: AdWidgetView,
  title: "Widgets/Ad",
});

export const Draft = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("$30.00 − $17.70 base − $1.38 fees − $0.60 reserve =", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Rules: off at $30.96 with no sales · budget +20% under $8.26"
      )
    ).toBeVisible();
  },
});

// prd.md > States and Boundaries #7
export const VideoFailed = meta.story({
  args: {
    ad: {
      ...ad,
      videos: [
        ad.videos[0] ?? {
          angle: "UGC on-model",
          seconds: 15,
          slot: "A",
          status: "ready",
        },
        { angle: "UGC styling", seconds: 15, slot: "B", status: "failed" },
      ],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Video B didn't render.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledWith(args.ad, "B");
  },
});

export const AddsToCampaign = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add to campaign" })
    );
    await expect(args.onAdd).toHaveBeenCalledOnce();
    await expect(await canvas.findByText("Added to campaign")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Skip" })).toBeNull();
  },
});

export const Skips = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));
    await expect(args.onSkip).toHaveBeenCalledOnce();
    await expect(await canvas.findByText("Skipped")).toBeVisible();
  },
});

export const WatchesFullScreen = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Watch video A full screen" })
    );
    await expect(args.onFullscreen).toHaveBeenCalledWith(true);
    await expect(
      canvas.getByText(
        "Check that the print matches your design before adding the ad."
      )
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to the widget" })
    );
    await expect(args.onFullscreen).toHaveBeenCalledWith(false);
  },
});

export const SendsFeedback = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("Feedback on these ads"),
      "Shorter headline{Enter}"
    );
    await expect(args.onFeedback).toHaveBeenCalledWith(ad, "Shorter headline");
  },
});
