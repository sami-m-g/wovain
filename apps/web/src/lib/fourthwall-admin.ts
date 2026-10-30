// Deep links into the Fourthwall admin, for what wovain doesn't cover. The
// admin signs the creator in and opens the path in their shop (the same
// links Fourthwall's own help center uses).

// The exact pages come from Fourthwall's help center (each article lists
// its admin modules), e.g. help.fourthwall.com set-up-meta-pixel.md.
const PATHS = {
  // Settings > Billing and payouts: "Set up your payouts" (Stripe Connect).
  billing: "/settings/billing/",
  home: "/",
  // Apps > Meta Conversions: Pixel ID and access token for server events.
  metaCapi: "/apps/meta-capi",
  orders: "/contributions/orders/",
  products: "/products/",
  promotions: "/promotions/",
  settings: "/settings/",
  // Settings > Shipping: shipping options and profiles.
  shipping: "/settings/shipping/",
  storeDesign: "/store-design/",
  // Analytics > Options > Tracking pixels: the Facebook Pixel field.
  trackingPixels: "/analytics/overview/tracking-pixels",
} as const;

export type FourthwallAdminPage = keyof typeof PATHS;

// With the shop's slug, straight to its page; otherwise the admin picks
// the creator's shop.
export const fourthwallAdminUrl = (
  page: FourthwallAdminPage,
  slug?: string | null
) =>
  slug
    ? `https://admin.fourthwall.com/store/${encodeURIComponent(slug)}${PATHS[page]}`
    : `https://admin.fourthwall.com/?redirectPath=${encodeURIComponent(PATHS[page])}`;
