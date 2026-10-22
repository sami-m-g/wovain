import type { Design } from "@wovain/shared/design";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { DesignWidgetView } from "./design-widget-view.tsx";
import type { DesignWidgetActions } from "./design-widget-view.tsx";

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
  extraPlacements: [],
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
  range: [],
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

const art = (url: string, widthPx = 2880, requiredPx = 1800) => ({
  requiredPx,
  transparent: true,
  url: `https://fal.media/files/demo/${url}`,
  widthPx,
});

const oneSize = (baseCost: number, size = "One size") => [
  { baseCost, inStock: true, size },
];

// The same idea as a drop: the tee plus a hoodie, mug, poster and sticker,
// priced with wovain's default rule (the server computes these quotes).
const drop: Design = {
  ...design,
  coach:
    "Tee up front, the hoodie carries the big back print, and the mark ties the mug and sticker in.",
  dropName: "Sakura Cat Club",
  extraPlacements: [
    {
      area: "Back",
      artwork: art("mark.png", 1200, 450),
      printSize: "3×3 in",
      style: "neck mark",
    },
  ],
  range: [
    {
      artwork: art("mark.png", 1200, 450),
      blank: { catalogProductId: "pro_hoodie", name: "Cotton Heritage M2580" },
      colors: [
        { hex: "#1c1c1c", inStock: true, name: "Black" },
        { hex: "#1f2a44", inStock: true, name: "Navy" },
      ],
      customizationId: "cus_hoodie",
      extraPlacements: [
        {
          area: "Back",
          artwork: art("back.png"),
          printSize: "12×16 in",
          style: "large center",
        },
      ],
      kind: "Hoodie",
      listing: {
        description: "The sunset cat, big on the back.",
        title: "Sakura Cat Club Hoodie – Sunset Back Print",
      },
      mockups: [
        {
          alt: "Black hoodie with the sunset cat on the back",
          color: "Black",
          url: "/mockups/hoodie-black.svg",
        },
      ],
      placement: { area: "Front", printSize: "3×3 in", style: "left chest" },
      quote: {
        baseCost: 33.5,
        breakevenPerSale: 11.61,
        cardFees: 1.93,
        marginPct: 30.2,
        price: 48,
        profit: 14.5,
        refundReserve: 0.96,
        roas: 4.14,
      },
      sizes: [
        { baseCost: 31.5, inStock: true, size: "M" },
        { baseCost: 33.5, inStock: true, size: "2XL" },
      ],
    },
    {
      artwork: art("wrap.png", 3840),
      blank: { catalogProductId: "pro_mug", name: "White glossy mug 11 oz" },
      colors: [{ hex: "#ffffff", inStock: true, name: "White" }],
      customizationId: "cus_mug",
      extraPlacements: [],
      kind: "Mug",
      listing: {
        description: "Morning tea with the sunset cat.",
        title: "Sakura Cat Club Mug – Sunset Cat",
      },
      mockups: [
        {
          alt: "White mug with the sunset cat",
          color: "White",
          url: "/mockups/mug-white.svg",
        },
      ],
      placement: { area: "Both sides", printSize: "8.5×3.5 in", style: "wrap" },
      quote: {
        baseCost: 9.6,
        breakevenPerSale: 10.83,
        cardFees: 1.13,
        marginPct: 56.4,
        price: 22,
        profit: 12.4,
        refundReserve: 0.44,
        roas: 2.03,
      },
      sizes: oneSize(9.6, "11 oz"),
    },
    {
      artwork: art("hero.png", 4500),
      blank: { catalogProductId: "pro_poster", name: "Matte poster 12×18" },
      colors: [{ hex: "#f5f5f0", inStock: true, name: "White" }],
      customizationId: "cus_poster",
      extraPlacements: [],
      kind: "Poster",
      listing: {
        description: "The full sunset, for the wall.",
        title: "Sakura Cat Club Poster – Vintage Sunset Art",
      },
      mockups: [
        {
          alt: "Poster with the sunset cat",
          color: "White",
          url: "/mockups/poster.svg",
        },
      ],
      placement: { area: "Front", printSize: "12×18 in", style: "full bleed" },
      quote: {
        baseCost: 12.4,
        breakevenPerSale: 10.88,
        cardFees: 1.22,
        marginPct: 50.4,
        price: 25,
        profit: 12.6,
        refundReserve: 0.5,
        roas: 2.3,
      },
      sizes: oneSize(12.4, "12×18"),
    },
    {
      artwork: art("mark.png", 1200, 450),
      blank: { catalogProductId: "pro_sticker", name: "Kiss-cut sticker 4×4" },
      colors: [{ hex: "#ffffff", inStock: true, name: "White" }],
      customizationId: "cus_sticker",
      extraPlacements: [],
      kind: "Sticker",
      listing: {
        description: "The cat mark, for laptops and bottles.",
        title: "Sakura Cat Club Sticker – Cat Mark",
      },
      mockups: [
        {
          alt: "Round sticker with the cat mark",
          color: "White",
          url: "/mockups/sticker.svg",
        },
      ],
      placement: { area: "Front", printSize: "4×4 in", style: "kiss-cut" },
      quote: {
        baseCost: 2.9,
        breakevenPerSale: 10.89,
        cardFees: 0.91,
        marginPct: 80.7,
        price: 15,
        profit: 12.1,
        refundReserve: 0.3,
        roas: 1.38,
      },
      sizes: oneSize(2.9, "4×4"),
    },
  ],
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
  component: DesignWidgetView,
  title: "Widgets/Design",
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

// Fourthwall hands back badge codes; the widget shows words.
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

export const SkipFails = meta.story({
  args: {
    onSkip: fn<DesignWidgetActions["onSkip"]>(
      async () => await Promise.reject(new Error("record_design failed"))
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "That didn’t go through"
    );
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeEnabled();
  },
});

// One idea as a drop: the hero tee plus four products, each priced.
export const Drop = meta.story({
  args: { design: drop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Sakura Cat Club · 5 products")
    ).toBeVisible();
    await expect(
      canvas.getByText(/One of each \$140\.00 → profit \$63\.90 · 46% margin/u)
    ).toBeVisible();
    await expect(canvas.getByText("Profit $14.50 · 30%")).toBeVisible();
    await expect(
      canvas.getByText(/Front · large center · 12×16 in \+ Back · neck mark/u)
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Approve 5 products" })
    ).toBeEnabled();
  },
});

export const DropDark = meta.story({
  args: { design: drop },
  globals: { theme: "dark" },
});

// prd.md > States and Boundaries #4, for any print in the drop.
export const DropLowResolution = meta.story({
  args: {
    design: {
      ...drop,
      range: drop.range.map((product) =>
        product.kind === "Hoodie"
          ? {
              ...product,
              extraPlacements: product.extraPlacements.map((item) => ({
                ...item,
                artwork: { ...item.artwork, widthPx: 1100 },
              })),
            }
          : product
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Cotton Heritage M2580 back/u)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Approve 5 products" })
    ).toBeDisabled();
  },
});

export const DropLive = meta.story({
  args: {
    design: {
      ...drop,
      productUrl: "https://wovain.fourthwall.com/collections/sakura-cat-club",
      status: "live",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "View the drop" })
    );
    await expect(args.onOpenLink).toHaveBeenCalledWith(
      "https://wovain.fourthwall.com/collections/sakura-cat-club"
    );
  },
});
