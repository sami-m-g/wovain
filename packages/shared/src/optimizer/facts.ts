import type { SizeCost } from "../economics.ts";
import type { AdDayRow } from "./snapshot.ts";

// What the rules read about each ad, design and campaign: numbers code
// computed from the snapshot and the ledger, each from one named source.

export interface AdFacts {
  active: boolean;
  adId: string;
  clicks: number;
  // The hook cluster the ad's creative belongs to (POD-C2).
  concept?: string;
  // Meta's daily rows for the ad, oldest first.
  days: AdDayRow[];
  impressions: number;
  // Meta's creative_fatigue webhook flagged the ad.
  metaFatigue?: boolean;
  metaPurchases: number;
  // Net sales on settled Fourthwall data, by utm_content.
  netSales: number;
  // Net sales by UTM after the ad was paused (POD-M3).
  netSalesAfterPause?: number;
  paused?: { at: number; by: "optimizer" | "meta" | "merchant" };
  // Spend on all data, and on data settled for both sources.
  settledSpend: number;
  spend: number;
  spendPerDay: number;
}

export interface DesignFacts {
  ads: AdFacts[];
  designId: string;
  // A limited drop's launch time (POD-S2).
  dropLaunchedAt?: number;
  // Profit per sale before ads at the planned (priciest-size) basis.
  perSale: number;
  price: number;
  productId: string;
  // Fourthwall sessions on the product page in the window.
  productSessions: number;
  season?: { endsAt: number; shipByAt?: number };
  // Units sold per size, with each size's base cost.
  sizes: (SizeCost & { units: number })[];
}

export interface CampaignFacts {
  campaignId: string;
  dailyBudget: number;
  // Net sales and spend on settled data.
  netSales: number;
  orders: number;
  multiUnitOrders: number;
  perSale: number;
  // Spend per day at the end of the window.
  spendPerDay: number;
  spend: number;
  baseCost: number;
  price: number;
}
