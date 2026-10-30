import { z } from "zod";

import { conversationId } from "./ads";
import type { ShopFacts } from "./store";
import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// Store setup (openspec store-management): taking the merchant's connected
// Fourthwall shop to sell-ready. This module reads what Fourthwall's and
// Meta's MCP servers can tell, and turns it into the tech checklist the
// Store page shows. Each step is done for the merchant through the approval
// queue, or is a one-click deep link the page ticks off when it's done.
// Replies are untrusted data: only fields with the expected shape are read.

// ---------------------------------------------------------------------------
// Custom domain

const DOMAIN_STATUSES = [
  "CONNECTED",
  "NOT_CONNECTED",
  "PARTIALLY_CONNECTED",
  "SYNCING_YOUR_DOMAIN",
  "REMOVAL_IN_PROGRESS",
] as const;

const dnsSchema = z.object({
  domain: z.string().min(1),
  records: z
    .array(z.object({ status: z.string().optional() }).loose())
    .default([]),
  status: z.enum(DOMAIN_STATUSES),
});

export interface DomainFacts {
  // Null when the shop runs on its Fourthwall subdomain only.
  domain: string | null;
  status: (typeof DOMAIN_STATUSES)[number] | null;
  // DNS records Fourthwall hasn't verified yet.
  pendingRecords: number;
}

// The custom domain's DNS state, as Fourthwall last checked it (read-only).
export const readDomain = async (call: ToolCall): Promise<DomainFacts> => {
  const [dns] = findAll(dnsSchema, await call("ecommerce_get-dns-entries", {}));
  if (dns === undefined) {
    return { domain: null, pendingRecords: 0, status: null };
  }
  return {
    domain: dns.domain,
    pendingRecords: dns.records.filter((record) => record.status !== "VALID")
      .length,
    status: dns.status,
  };
};

// ---------------------------------------------------------------------------
// The Meta pixel on the shop

const PIXEL_WINDOW_DAYS = 7;
const DAY_S = 86_400;

const hostRowSchema = z
  .object({
    count: z.union([z.number(), z.string()]).optional(),
    host: z.string().optional(),
    value: z.string().optional(),
  })
  .loose();

const hostOf = (row: z.infer<typeof hostRowSchema>) =>
  (row.host ?? row.value ?? "").toLowerCase();

const onShop = (host: string, shopHosts: string[]) =>
  host !== "" &&
  shopHosts.some((shop) => host === shop || host.endsWith(`.${shop}`));

export interface PixelFacts {
  datasetId: string;
  // The dataset received events from the storefront in the last 7 days.
  firing: boolean;
}

// Whether the dataset received events from one of the shop's hosts in the
// last week: the proof that Fourthwall's pixel setting points at it.
export const pixelOnShop = async (
  call: ToolCall,
  {
    datasetId,
    hosts,
    now = new Date(),
  }: { datasetId: string; hosts: string[]; now?: Date }
): Promise<PixelFacts> => {
  const end = Math.floor(now.getTime() / 1000);
  const reply = await call("ads_get_dataset_stats", {
    advertiser_job: "set_up_and_fix_ad_account",
    aggregation: "host",
    client_conversation_id: conversationId(`store-setup:${datasetId}`),
    dataset_id: datasetId,
    end_time: String(end),
    start_time: String(end - PIXEL_WINDOW_DAYS * DAY_S),
  });
  const firing = findAll(hostRowSchema, reply).some((row) =>
    onShop(hostOf(row), hosts)
  );
  return { datasetId, firing };
};

// ---------------------------------------------------------------------------
// The tech checklist

export const SETUP_STEPS = [
  "connect",
  "payouts",
  "site_live",
  "pixel",
  "domain",
  "policies",
] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

// done: nothing left. todo: the merchant (or wovain) has a step to take.
// waiting: someone else has to act (Fourthwall's review, another step
// first). check: wovain can't read it, so the merchant reviews it.
export type SetupState = "done" | "todo" | "waiting" | "check";

// How a step gets done: wovain does it through the approval queue, or a
// deep link the merchant follows and the page then ticks off.
export type SetupHow = "do_it" | "link" | "reconnect" | "connect_meta" | "none";

export interface SetupStep {
  id: SetupStepId;
  state: SetupState;
  how: SetupHow;
  // Blocks selling while not done.
  required: boolean;
  // Done on the merchant's word, where no API can tell (payouts Fourthwall
  // support set up by hand through PayPal or bill.com).
  confirmedByMerchant?: boolean;
}

// The steps a merchant can mark done themselves: payouts set up by
// Fourthwall support, which the dashboard (and get-payout-info) can't see.
export const CONFIRMABLE_STEPS = ["payouts"] as const;
export type ConfirmableStep = (typeof CONFIRMABLE_STEPS)[number];

const DOMAIN_DONE: ReadonlySet<string> = new Set([
  "CONNECTED",
  "PARTIALLY_CONNECTED",
]);

export interface SetupInput {
  shop: ShopFacts;
  domain: DomainFacts | undefined;
  // Undefined when Meta isn't connected or has no single pixel.
  pixel: PixelFacts | undefined;
  metaConnected: boolean;
  // Steps the merchant marked done (CONFIRMABLE_STEPS).
  confirmed?: readonly ConfirmableStep[] | undefined;
}

// Payouts: ACTIVE from get-payout-info is done. Stripe onboarding started
// but unfinished (IN_PROGRESS) is still the merchant's to finish. Payouts
// set up by support (PayPal, bill.com) never show as ACTIVE, so the
// merchant's word marks them done.
const payoutsStep = (
  status: string | undefined,
  confirmed: boolean
): Pick<SetupStep, "confirmedByMerchant" | "how" | "state"> => {
  if (status === "ACTIVE") {
    return { how: "none", state: "done" };
  }
  if (confirmed) {
    return { confirmedByMerchant: true, how: "none", state: "done" };
  }
  return { how: "link", state: "todo" };
};

export const evaluateSetup = ({
  shop,
  domain,
  pixel,
  metaConnected,
  confirmed = [],
}: SetupInput): SetupStep[] => {
  // The grant reads the shop: connected.
  const connected = shop.siteStatus !== undefined;
  const held = shop.verificationRestrictions.length > 0;
  const live = shop.siteStatus === "LIVE";
  // Fourthwall's review blocks going live; only Fourthwall lifts it.
  let siteState: SetupState = "todo";
  if (live) {
    siteState = "done";
  } else if (held) {
    siteState = "waiting";
  }
  const pixelStep = (): Pick<SetupStep, "how" | "state"> => {
    if (!metaConnected) {
      return { how: "connect_meta", state: "waiting" };
    }
    if (pixel === undefined) {
      return { how: "connect_meta", state: "waiting" };
    }
    return pixel.firing
      ? { how: "none", state: "done" }
      : { how: "link", state: "todo" };
  };
  const domainStep = (): Pick<SetupStep, "how" | "state"> => {
    if (domain?.domain === null || domain === undefined) {
      // The Fourthwall subdomain sells; a custom domain is optional.
      return { how: "link", state: "check" };
    }
    return domain.status !== null && DOMAIN_DONE.has(domain.status)
      ? { how: "none", state: "done" }
      : { how: "link", state: "todo" };
  };
  return [
    {
      how: connected ? "none" : "reconnect",
      id: "connect",
      required: true,
      state: connected ? "done" : "todo",
    },
    {
      ...payoutsStep(shop.payoutStatus, confirmed.includes("payouts")),
      id: "payouts",
      required: true,
    },
    {
      how: live ? "none" : "do_it",
      id: "site_live",
      required: true,
      state: siteState,
    },
    { ...pixelStep(), id: "pixel", required: true },
    { ...domainStep(), id: "domain", required: false },
    // No MCP tool reads the shop's policies: the merchant reviews them.
    { how: "link", id: "policies", required: false, state: "check" },
  ];
};
