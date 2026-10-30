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
  storeDesign: "/store-design/",
  // Analytics > Options > Tracking pixels: the Facebook Pixel field.
  trackingPixels: "/analytics/overview/tracking-pixels",
} as const;

export type FourthwallAdminPage = keyof typeof PATHS;

export const fourthwallAdminUrl = (page: FourthwallAdminPage) =>
  `https://admin.fourthwall.com/?redirectPath=${encodeURIComponent(PATHS[page])}`;
