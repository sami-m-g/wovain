import type { Design } from "@wovain-foss/shared/design";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { DesignCardView } from "./design-card-view.tsx";

// Synthetic design for Storybook: the PRD's demo tee, mockups are placeholder SVGs.
const design: Design = {
  artwork: {
    requiredPx: 1800,
    transparent: true,
    url: "https://fal.media/files/demo/art.png",
    widthPx: 4500,
  },
  blank: {
    badge: "Our pick",
    catalogProductId: "pro_demo",
    name: "Bella+Canvas 3001 tee",
    rating: 4.6,
  },
  coach: "Soft bestseller tee, and the art prints sharp at this size.",
  colors: [
    { hex: "#1c1c1c", inStock: true, name: "Black" },
    { hex: "#1f2a44", inStock: true, name: "Navy" },
    { hex: "#e9e1d1", inStock: true, name: "Natural" },
    { hex: "#b9b9b9", inStock: false, name: "Ash" },
  ],
  customizationId: "cus_demo",
  id: "d1",
  idea: "Japanese cat sunset",
  listing: {
    description:
      "A sleepy cat watches the sun sink behind the sakura. Soft, vintage-washed colors.",
    title: "Japanese Cat Sunset Tee – Vintage Sakura Graphic",
  },
  mockups: [
    {
      alt: "Black tee with the cat sunset print",
      color: "Black",
      url: "/mockups/tee-black.svg",
    },
    {
      alt: "Navy tee with the cat sunset print",
      color: "Navy",
      url: "/mockups/tee-navy.svg",
    },
    {
      alt: "Natural tee with the cat sunset print",
      color: "Natural",
      url: "/mockups/tee-natural.svg",
    },
  ],
  placement: { area: "Front", printSize: "12×16 in", style: "large center" },
  quote: {
    baseCost: 17.7,
    breakevenPerSale: 10.32,
    cardFees: 1.38,
    marginPct: 41,
    price: 30,
    profit: 12.3,
    refundReserve: 0.6,
    roas: 2.9,
  },
  rejectCount: 0,
  sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"].map(
    (size) => ({
      baseCost: size.endsWith("XL") && size.length > 2 ? 20.7 : 17.7,
      inStock: size !== "4XL" && size !== "5XL",
      size,
    })
  ),
  status: "draft",
};

const live: Design = {
  ...design,
  productId: "off_demo",
  productUrl: "https://wovain.fourthwall.com/products/japanese-cat-sunset-tee",
  status: "live",
};

const meta = preview.meta({
  args: {
    design,
    onApprove: fn(async () => {
      await Promise.resolve();
    }),
    onFeedback: fn(async () => {
      await Promise.resolve();
    }),
    onOpenDesigner: fn(async () => {
      await Promise.resolve();
    }),
    onOpenLink: fn(async () => {
      await Promise.resolve();
    }),
    onReprice: fn(async (current: Design) => await Promise.resolve(current)),
    onSkip: fn(
      async (current: Design) =>
        await Promise.resolve({ ...current, status: "skipped" as const })
    ),
    poll: fn(async () => await Promise.resolve(live)),
    pollMs: 50,
    pricing: { minMarginPct: 30, minProfit: 10 },
  },
  component: DesignCardView,
  title: "Cards/Design",
});

export const Draft = meta.story();

export const SwitchesColor = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Navy" }));
    const mockup = canvas.getByAltText<HTMLImageElement>(
      "Navy tee with the cat sunset print"
    );
    await waitFor(async () => {
      await expect(mockup.naturalWidth).toBeGreaterThan(0);
    });
    await expect(
      canvas.getByAltText("Navy tee with the cat sunset print")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Ash (out of stock)" })
    ).toBeDisabled();
  },
});

// prd.md > States and Boundaries #4
export const LowResolution = meta.story({
  args: {
    design: {
      ...design,
      artwork: { ...design.artwork, requiredPx: 1500, widthPx: 1100 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        /This artwork is 1100 px, and this print size needs 1500 px or more/u
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Approve" })
    ).toBeDisabled();
  },
});

export const ApproveGoesLive = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await expect(args.onApprove).toHaveBeenCalledOnce();
    await waitFor(async () => {
      await expect(canvas.getByText("Live")).toBeVisible();
    });
    await userEvent.click(canvas.getByRole("button", { name: "View in shop" }));
    await expect(args.onOpenLink).toHaveBeenCalledWith(live.productUrl);
  },
});

export const Publishing = meta.story({
  args: {
    design: { ...design, status: "publishing" },
    poll: fn(async (current: Design) => await Promise.resolve(current)),
  },
});

export const Live = meta.story({ args: { design: live } });

// prd.md > States and Boundaries #6
export const Rejected = meta.story({
  args: {
    design: {
      ...design,
      rejectCount: 1,
      rejectReason: "the artwork overlaps the print area edge",
      status: "rejected",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Your edits are saved."
    );
    await expect(
      canvas.getByRole("button", { name: "Try again" })
    ).toBeEnabled();
  },
});

export const RejectedTwice = meta.story({
  args: {
    design: {
      ...design,
      rejectCount: 2,
      rejectReason: "the artwork overlaps the print area edge",
      status: "rejected",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Fourthwall designer" })
    );
    await expect(args.onOpenDesigner).toHaveBeenCalledOnce();
  },
});

export const Skips = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));
    await expect(args.onSkip).toHaveBeenCalledOnce();
    await expect(await canvas.findByText("Skipped")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
});

export const SendsFeedback = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("Feedback on this design"),
      "Make the sun bigger{Enter}"
    );
    await expect(args.onFeedback).toHaveBeenCalledWith(
      design,
      "Make the sun bigger"
    );
  },
});

export const Reprices = meta.story({
  args: {
    onReprice: fn(
      async (current: Design) =>
        await Promise.resolve({
          ...current,
          quote: { ...current.quote, marginPct: 43, price: 32, profit: 14.3 },
        })
    ),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Pricing settings" })
    );
    const profit = canvas.getByLabelText("Minimum profit");
    await userEvent.clear(profit);
    await userEvent.type(profit, "12");
    await userEvent.click(canvas.getByRole("button", { name: "Reprice" }));
    await expect(args.onReprice).toHaveBeenCalledWith(design, {
      minMarginPct: 30,
      minProfit: 12,
    });
    await expect(await canvas.findByText("$32")).toBeVisible();
  },
});

// Fourthwall hands back badge codes; the card shows words.
export const RawBadgeCodes = meta.story({
  args: {
    design: {
      ...design,
      blank: { ...design.blank, badge: "OUR_PICK · BESTSELLER" },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Our pick · Bestseller")
    ).toBeVisible();
  },
});
