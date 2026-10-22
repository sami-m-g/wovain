import type { Ad, AdConcept, Decision } from "@wovain/shared/ad";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { AdWidgetView } from "./ad-widget-view.tsx";
import type { AdWidgetActions } from "./ad-widget-view.tsx";

// Synthetic ads for Storybook: the PRD's demo tee with three concepts; the
// visuals are placeholder mockups and clips.
const gift: AdConcept = {
  angle: "Gift for the cat person who has everything",
  assets: [
    {
      alt: "Friends swapping gifts at a sunset picnic, one holds up the tee",
      kind: "image",
      ratio: "4:5",
      source: "fal",
      status: "ready",
      url: "/mockups/tee-natural.svg",
    },
    {
      alt: "A woman in the tee laughs with her cat on a sunlit sofa",
      kind: "image",
      ratio: "9:16",
      source: "fal",
      status: "ready",
      url: "/mockups/tee-navy.svg",
    },
  ],
  audience: "Cat owners who collect Japanese prints and Ghibli art",
  cta: "SHOP_NOW",
  gap: "Rival cat tees all lead with jokes; none with a calm, art-print look",
  headlines: ["The cat tee they'll actually wear", "Sakura Season Cat Tee"],
  hook: "For the friend whose cat runs the house.",
  id: "c1",
  name: "The gift",
  primaryTexts: [
    "For the friend whose cat runs the house. A calico watches Mount Fuji glow.",
    "Soft, vintage-washed colors on a tee they'll wear all spring.",
  ],
  revision: 1,
  status: "draft",
  whyNow: "Cherry blossom forecasts are out this week",
};

const proof: AdConcept = {
  angle: "The print up close",
  assets: [
    {
      alt: "Black tee with the cat sunset print",
      kind: "image",
      ratio: "1:1",
      source: "fourthwall",
      status: "ready",
      url: "/mockups/tee-black.svg",
    },
    {
      alt: "Try-on clip in a sunlit room",
      kind: "video",
      ratio: "9:16",
      source: "fal",
      status: "ready",
      url: "/videos/ugc-A.mp4",
    },
  ],
  audience: "Shoppers who want art that holds up wash after wash",
  cta: "SHOP_NOW",
  headlines: ["Sunset print, made to order"],
  hook: "Every color of the sunset, printed edge to edge.",
  id: "c2",
  name: "Print up close",
  primaryTexts: ["Every color of the sunset, printed edge to edge."],
  revision: 1,
  status: "draft",
};

const carousel: AdConcept = {
  angle: "The set",
  assets: [],
  audience: "Cat people who buy more than one",
  cards: [
    {
      designId: "d1",
      headline: "Sunset Cat",
      imageUrl: "/mockups/tee-black.svg",
    },
    {
      designId: "d2",
      headline: "Night Cat",
      imageUrl: "/mockups/tee-navy.svg",
    },
    {
      designId: "d3",
      headline: "Garden Cat",
      imageUrl: "/mockups/tee-natural.svg",
    },
  ],
  cta: "SHOP_NOW",
  headlines: ["Three cats, three sunsets"],
  hook: "Three cats, three sunsets. Pick yours.",
  id: "c3",
  name: "The set",
  primaryTexts: ["Three cats, three sunsets. Pick yours."],
  revision: 1,
  status: "draft",
};

const ad: Ad = {
  coach: "Three angles: a gift, the print and the set. Good margin for a test.",
  concepts: [gift, proof, carousel],
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
};

const decide = (current: Ad, conceptId: string, status: Decision) => {
  const concepts = current.concepts.map((concept) =>
    concept.id === conceptId ? { ...concept, status } : concept
  );
  return { ...current, concepts };
};

const meta = preview.meta({
  args: {
    ad,
    onCreateCampaign: fn(async () => {
      await Promise.resolve();
    }),
    onDecide: fn(
      async (current: Ad, conceptId: string, status: Decision) =>
        await Promise.resolve(decide(current, conceptId, status))
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
  },
  component: AdWidgetView,
  title: "Widgets/Ad",
});

export const Draft = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("3 ad concepts · 0 approved · 3 to decide")
    ).toBeVisible();
    await expect(
      canvas.getByText("For the friend whose cat runs the house.")
    ).toBeVisible();
    await expect(canvas.getByText("Feed 4:5 · AI")).toBeVisible();
    await expect(canvas.getByText("Feed 1:1 · mockup")).toBeVisible();
    await expect(
      canvas.getByText(
        "Rules: off at $30.96 with no sales · budget +20% under $8.26"
      )
    ).toBeVisible();
  },
});

export const DraftDark = meta.story({ globals: { theme: "dark" } });

export const ApprovesOne = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const [approve] = canvas.getAllByRole("button", { name: "Approve" });
    if (approve !== undefined) {
      await userEvent.click(approve);
    }
    await expect(args.onDecide).toHaveBeenCalledWith(args.ad, "c1", "approved");
    await expect(await canvas.findByText("Approved")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Approve" })
    ).toHaveLength(2);
  },
});

export const SkipsOne = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const skips = canvas.getAllByRole("button", { name: "Skip" });
    await userEvent.click(skips[1] ?? skips[0] ?? canvasElement);
    await expect(args.onDecide).toHaveBeenCalledWith(args.ad, "c2", "skipped");
    await expect(await canvas.findByText("Skipped")).toBeVisible();
  },
});

export const SendsFeedback = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("Feedback on The gift"),
      "More playful{Enter}"
    );
    await expect(args.onFeedback).toHaveBeenCalledWith(
      args.ad,
      "c1",
      "More playful"
    );
  },
});

// A concept redrawn after feedback keeps the others' choices.
export const Revised = meta.story({
  args: {
    ad: {
      ...ad,
      concepts: [
        {
          ...gift,
          feedback: "use the back print",
          hook: "Turn around: the cat's on the back too.",
          revision: 2,
        },
        { ...proof, status: "approved" },
        { ...carousel, status: "skipped" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Changed for “use the back print”")
    ).toBeVisible();
    await expect(canvas.getByText("· revision 2")).toBeVisible();
  },
});

export const VisualFailed = meta.story({
  args: {
    ad: {
      ...ad,
      concepts: [
        {
          ...gift,
          assets: [
            ...gift.assets.slice(0, 1),
            {
              alt: "Stories scene",
              kind: "image",
              ratio: "9:16",
              source: "fal",
              status: "failed",
            },
          ],
        },
      ],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Stories and Reels 9:16 didn't render.")
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
});

// Every concept decided and at least one approved: the campaign can be built.
export const ReadyForCampaign = meta.story({
  args: {
    ad: {
      ...ad,
      concepts: [
        { ...gift, status: "approved" },
        { ...proof, status: "approved" },
        { ...carousel, status: "skipped" },
      ],
      status: "added",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("3 ad concepts · 2 approved")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Create campaign" })
    );
    await expect(args.onCreateCampaign).toHaveBeenCalledOnce();
    await expect(
      canvas.getByText(
        "Built paused in Meta. Nothing spends until you press Launch."
      )
    ).toBeVisible();
  },
});

export const ReadyForCampaignDark = meta.story({
  args: ReadyForCampaign.input.args,
  globals: { theme: "dark" },
});

export const WatchesFullScreen = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "See full screen: A woman in the tee laughs with her cat on a sunlit sofa",
      })
    );
    await expect(args.onFullscreen).toHaveBeenCalledWith(true);
    await expect(
      canvas.getByText(
        "Check that the print matches your design before you approve."
      )
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to the ads" })
    );
    await expect(args.onFullscreen).toHaveBeenCalledWith(false);
  },
});

export const ApproveFails = meta.story({
  args: {
    onDecide: fn<AdWidgetActions["onDecide"]>(
      async () => await Promise.reject(new Error("record_ad failed"))
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [approve] = canvas.getAllByRole("button", { name: "Approve" });
    if (approve !== undefined) {
      await userEvent.click(approve);
    }
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "That didn’t go through"
    );
  },
});
