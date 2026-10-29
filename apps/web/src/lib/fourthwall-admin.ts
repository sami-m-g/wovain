// Deep links into the Fourthwall admin, for what wovain doesn't cover. The
// admin signs the creator in and opens the path in their shop (the same
// links Fourthwall's own help center uses).

const PATHS = {
  home: "/",
  orders: "/contributions/orders/",
  products: "/products/",
  promotions: "/promotions/",
  settings: "/settings/",
  storeDesign: "/store-design/",
} as const;

export type FourthwallAdminPage = keyof typeof PATHS;

export const fourthwallAdminUrl = (page: FourthwallAdminPage) =>
  `https://admin.fourthwall.com/?redirectPath=${encodeURIComponent(PATHS[page])}`;
