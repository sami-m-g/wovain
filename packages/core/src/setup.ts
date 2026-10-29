import { z } from "zod";

import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// Which setup steps a merchant has finished, read from their accounts. The
// "10 minutes to a live campaign" clock covers all of them, so each reports
// its own milestone and the funnel shows which one is slow. Replies are
// untrusted account data: a field that isn't there counts as not done yet.
// Fourthwall's payout state has no MCP tool yet, so payouts_ready is not
// reported until one exists.

const idish = z.union([z.string().min(1), z.number()]);
const ACTIVE_ACCOUNT_STATUS = 1;

/** Fourthwall: the merchant has a shop with a storefront URL. */
export const shopReady = async (call: ToolCall) =>
  findAll(
    z.looseObject({ baseUrl: z.url() }),
    await call("ecommerce_get-current-shop", {})
  ).length > 0;

/** Meta: the ad account is active, which means a payment method is on file. */
export const metaPaymentReady = async (call: ToolCall) => {
  const accounts = findAll(
    z.looseObject({
      account_status: z.union([z.string(), z.number()]).optional(),
      ad_account_id: idish,
      is_ads_mcp_enabled: z.literal(true),
    }),
    await call("ads_get_ad_accounts", {})
  );
  return accounts.some(
    (account) =>
      account.account_status === ACTIVE_ACCOUNT_STATUS ||
      String(account.account_status).toUpperCase() === "ACTIVE"
  );
};

/** Meta: the account has a Facebook Page to run ads from. */
export const metaPageReady = async (call: ToolCall, adAccountId: string) =>
  findAll(
    z.looseObject({ page_id: idish }),
    await call("ads_get_ad_account_pages", { ad_account_id: adAccountId })
  ).length > 0;

/** Meta: the account has a pixel (dataset) to measure sales with. */
export const pixelReady = async (call: ToolCall, adAccountId: string) =>
  findAll(
    z.looseObject({ id: idish }),
    await call("ads_get_datasets", { ad_account_id: adAccountId })
  ).length > 0;
