import { z } from "zod";

import { throwBulkErrors } from "./fourthwall";
import { findAll, findOne } from "./upstream";
import type { ToolCall } from "./upstream";

// Running the merchant's Fourthwall store after a product exists
// (openspec store-management): the readiness check, the product lifecycle,
// one collection per drop, launch promotions, orders and their exceptions,
// samples and per-size prices. Every write here is called by an executor of
// an approved action (packages/api flow/store.ts), never by an agent
// directly. Replies are untrusted data from the merchant's shop: only fields
// with the expected shape are read.

// ---------------------------------------------------------------------------
// Readiness

// What wovain needs to know before anything goes public.
export interface ShopFacts {
  // LIVE, COMING_SOON, PASSWORD_PROTECTED or INACTIVE.
  siteStatus: string | undefined;
  // Non-empty while Fourthwall is verifying the shop. Never shown by name.
  verificationRestrictions: string[];
  shippingEnabled: boolean;
  enabledShippingProfiles: number;
  // INACTIVE, IN_PROGRESS or ACTIVE.
  payoutStatus: string | undefined;
  baseUrl: string | undefined;
  // The shop's name, as buyers see it.
  name: string | undefined;
  // The hosts the storefront answers on, lower-case.
  hosts: string[];
  // The shop's handle in the Fourthwall admin (admin.fourthwall.com/store/<slug>/).
  slug?: string | undefined;
}

export const READINESS_CHECKS = [
  "site_live",
  "verified",
  "shipping",
  "payouts",
] as const;
export type ReadinessCheckId = (typeof READINESS_CHECKS)[number];

export interface ReadinessCheck {
  id: ReadinessCheckId;
  ok: boolean;
  // Blocks publishing when not ok. Payouts only warn: sales still go
  // through while Stripe onboarding finishes. Shipping only warns too: it
  // covers self-fulfilled items, and Fourthwall ships what it makes
  // (help.fourthwall.com change-shipping-options).
  blocking: boolean;
}

export interface Readiness {
  ready: boolean;
  checks: ReadinessCheck[];
}

export const evaluateReadiness = (facts: ShopFacts): Readiness => {
  const checks: ReadinessCheck[] = [
    { blocking: true, id: "site_live", ok: facts.siteStatus === "LIVE" },
    {
      blocking: true,
      id: "verified",
      ok: facts.verificationRestrictions.length === 0,
    },
    {
      blocking: false,
      id: "shipping",
      ok: facts.shippingEnabled && facts.enabledShippingProfiles > 0,
    },
    { blocking: false, id: "payouts", ok: facts.payoutStatus === "ACTIVE" },
  ];
  return {
    checks,
    ready: checks.every((check) => check.ok || !check.blocking),
  };
};

const shopSchema = z.object({
  baseUrl: z.string().optional(),
  customDomains: z
    .array(z.union([z.string(), z.object({ domain: z.string() })]))
    .optional(),
  internalDomain: z.string().optional(),
  name: z.string().optional(),
  primaryDomain: z.string().optional(),
  slug: z.string().min(1).optional(),
  status: z.string(),
  verificationRestrictions: z.array(z.string()).default([]),
});
const shippingSchema = z.object({
  enabled: z.boolean(),
  shippingProfiles: z
    .array(z.object({ enabled: z.boolean().default(true) }))
    .default([]),
});
const payoutSchema = z.object({
  status: z.enum(["INACTIVE", "IN_PROGRESS", "ACTIVE"]),
});

// The shop's handle from its Fourthwall subdomain (<slug>.fourthwall.com),
// when the reply has no slug of its own.
const FOURTHWALL_SUBDOMAIN = /^(?<slug>[a-z0-9-]+)\.fourthwall\.com$/u;
const fourthwallSubdomain = (host: string | undefined) =>
  host?.toLowerCase().match(FOURTHWALL_SUBDOMAIN)?.groups?.slug;

// Every host the storefront answers on (its Fourthwall subdomain and any
// custom domain), lower-case: what the Meta pixel's events must come from.
const shopHosts = (site: z.infer<typeof shopSchema> | undefined) => {
  if (site === undefined) {
    return [];
  }
  const names = [
    site.primaryDomain,
    site.internalDomain,
    ...(site.customDomains ?? []).map((each) =>
      typeof each === "string" ? each : each.domain
    ),
  ];
  if (site.baseUrl !== undefined && URL.canParse(site.baseUrl)) {
    names.push(new URL(site.baseUrl).host);
  }
  return [
    ...new Set(
      names.flatMap((name) =>
        name === undefined || name === "" ? [] : [name.toLowerCase()]
      )
    ),
  ];
};

// Reads the three replies the readiness check needs, in parallel. The
// user's Fourthwall role isn't read: Fourthwall refuses any write the role
// doesn't allow, and that error reaches the merchant.
export const readShopFacts = async (call: ToolCall): Promise<ShopFacts> => {
  const [shop, shipping, payout] = await Promise.all([
    call("ecommerce_get-current-shop", {}),
    call("ecommerce_get-shipping-profiles", {}),
    call("ecommerce_get-payout-info", {}),
  ]);
  const [site] = findAll(shopSchema, shop);
  const [ship] = findAll(shippingSchema, shipping);
  const [pay] = findAll(payoutSchema, payout);
  return {
    baseUrl: site?.baseUrl,
    enabledShippingProfiles:
      ship?.shippingProfiles.filter((profile) => profile.enabled).length ?? 0,
    hosts: shopHosts(site),
    name: site?.name,
    payoutStatus: pay?.status,
    shippingEnabled: ship?.enabled ?? false,
    siteStatus: site?.status,
    slug: site?.slug ?? fourthwallSubdomain(site?.internalDomain),
    verificationRestrictions: site?.verificationRestrictions ?? [],
  };
};

// ---------------------------------------------------------------------------
// Product lifecycle

// wovain's product statuses. `hidden` is the draft (Fourthwall HIDDEN, never
// shown yet) and `public` is live; both names predate the lifecycle and
// stay, so existing rows keep their meaning.
export const PRODUCT_STATUSES = [
  "hidden",
  "in_review",
  "public",
  "paused",
  "retired",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type LifecycleMove = "review" | "publish" | "unpublish" | "retire";

// Which statuses each move may start from.
const MOVES: Record<LifecycleMove, readonly ProductStatus[]> = {
  publish: ["hidden", "in_review", "paused"],
  retire: ["hidden", "in_review", "public", "paused"],
  review: ["hidden"],
  unpublish: ["public"],
};

const RESULT: Record<LifecycleMove, ProductStatus> = {
  publish: "public",
  retire: "retired",
  review: "in_review",
  unpublish: "paused",
};

export const canMove = (from: ProductStatus, move: LifecycleMove) =>
  MOVES[move].includes(from);

export const nextStatus = (move: LifecycleMove) => RESULT[move];

const offerSchema = z.object({
  available: z.boolean().optional(),
  id: z.string().min(1),
  status: z.enum(["PUBLIC", "HIDDEN", "ARCHIVED"]),
});

// The offer as Fourthwall has it now: the tool asks to read before writing.
export const readOffer = async (call: ToolCall, offerId: string) => {
  const found = findAll(
    offerSchema,
    await call("ecommerce_get-offers-by-ids", { offerIds: [offerId] })
  ).find((offer) => offer.id === offerId);
  if (found === undefined) {
    throw new Error("Fourthwall didn't return the product");
  }
  return found;
};

// Hides (pause) or archives (retire) an offer, after reading it. A product
// already in that state is left alone.
export const setOfferVisibility = async (
  call: ToolCall,
  offerId: string,
  status: "HIDDEN" | "ARCHIVED"
) => {
  const current = await readOffer(call, offerId);
  if (current.status === status) {
    return;
  }
  throwBulkErrors(
    await call("ecommerce_update-offer-status", { offerId, status })
  );
};

// ---------------------------------------------------------------------------
// Collections: one per drop

const collectionSchema = z.object({
  id: z.string().min(1),
  slug: z.string().optional(),
  state: z.string().optional(),
});

// Creates the drop's collection. Fourthwall creates it HIDDEN.
export const createCollection = async (
  call: ToolCall,
  {
    description,
    name,
    offerIds,
  }: { description: string; name: string; offerIds: string[] }
) => {
  const created = await call("ecommerce_create-collection", {
    available: true,
    description,
    name: name.slice(0, 200),
    offerIds,
  });
  throwBulkErrors(created);
  return findOne(collectionSchema, created, "collection").id;
};

// Publishes the collection and, with it, the products inside it. Returns
// the collection's storefront page when Fourthwall gives its slug.
export const publishCollection = async (
  call: ToolCall,
  collectionId: string,
  baseUrl?: string
) => {
  const reply = await call("ecommerce_update-collection-state", {
    collectionId,
    shouldUpdateOffersStatus: true,
    state: "PUBLIC",
  });
  throwBulkErrors(reply);
  const [published] = findAll(collectionSchema, reply);
  return published?.slug === undefined || baseUrl === undefined
    ? undefined
    : new URL(`/collections/${published.slug}`, baseUrl).href;
};

// Hides the collection again (the undo of a drop's publish). Its products
// are hidden one by one by the caller, so only the collection moves here.
export const hideCollection = async (call: ToolCall, collectionId: string) =>
  throwBulkErrors(
    await call("ecommerce_update-collection-state", {
      collectionId,
      shouldUpdateOffersStatus: false,
      state: "HIDDEN",
    })
  );

// ---------------------------------------------------------------------------
// Launch promotions

export interface LaunchPromotion {
  code: string;
  // 1–100, whole percent.
  percentage: number;
  // At most 1,000 (Fourthwall's cap); absent means unlimited.
  maxUses?: number | undefined;
  // The drop's products; the code applies to these only.
  offerIds: string[];
}

export const PROMO_CODE = /^[A-Z0-9]{3,24}$/u;
export const MAX_PROMO_USES = 1000;

const promotionSchema = z.object({ id: z.string().min(1) });

export const activatePromotion = async (call: ToolCall, promotionId: string) =>
  throwBulkErrors(await call("ecommerce_activate-promotion", { promotionId }));

export const deactivatePromotion = async (
  call: ToolCall,
  promotionId: string
) =>
  throwBulkErrors(
    await call("ecommerce_deactivate-promotion", { promotionId })
  );

// How often switching a fresh code off is tried before giving up: until it
// is off, customers can use a discount nobody approved to go live.
export const DEACTIVATE_ATTEMPTS = 3;

// A code created but not switched off: it is live on the storefront with no
// end. Its message says so, so the error tracked for it does too.
export class PromotionLeftLiveError extends Error {
  readonly promotionId: string;
  constructor(promotionId: string, code: string, cause: unknown) {
    super(
      `The launch code ${code} (${promotionId}) was created but couldn't be switched off, so it is live: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
    this.name = "PromotionLeftLiveError";
    this.promotionId = promotionId;
  }
}

// Switches a fresh code off, retrying a failed call; throws
// PromotionLeftLiveError when every attempt fails.
export const endFreshPromotion = async (
  call: ToolCall,
  promotionId: string,
  code: string
) => {
  let last: unknown;
  for (let attempt = 0; attempt < DEACTIVATE_ATTEMPTS; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries in order
      await deactivatePromotion(call, promotionId);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw new PromotionLeftLiveError(promotionId, code, last);
};

// Creates the promotion and ends it at once, so it exists but nobody can
// use it until the scheduled activation. Fourthwall has no start or end
// date: wovain's Inngest schedule switches it on and off.
export const createInactivePromotion = async (
  call: ToolCall,
  promo: LaunchPromotion
) => {
  const created = await call("ecommerce_create-shop-promotion", {
    code: promo.code,
    discountType: "PERCENTAGE",
    percentage: promo.percentage,
    productIds: promo.offerIds,
    ...(promo.maxUses === undefined ? {} : { maxUses: promo.maxUses }),
  });
  throwBulkErrors(created);
  const { id } = findOne(promotionSchema, created, "promotion");
  await endFreshPromotion(call, id, promo.code);
  return id;
};

// Pages of 10 read when looking a code up: get-promotions lists newest
// first, and a launch code being repaired was made moments ago.
const PROMOTION_PAGES = 5;
const PROMOTION_PAGE_SIZE = 10;

const codedPromotionSchema = z.object({
  code: z.string().min(1),
  id: z.string().min(1),
});

// The shop promotion with this code, if Fourthwall lists one: how a retry
// finds a code an earlier attempt created before it failed.
export const findPromotionByCode = async (call: ToolCall, code: string) => {
  const wanted = code.toUpperCase();
  for (let page = 0; page < PROMOTION_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages in order, stop early
    const reply = await call("ecommerce_get-promotions", {
      page,
      size: PROMOTION_PAGE_SIZE,
    });
    const listed = findAll(codedPromotionSchema, reply);
    const found = listed.find((item) => item.code.toUpperCase() === wanted);
    if (found !== undefined) {
      return found.id;
    }
    if (listed.length < PROMOTION_PAGE_SIZE) {
      return;
    }
  }
};

// ---------------------------------------------------------------------------
// Orders

export const ORDER_CURRENCIES = [
  "USD",
  "EUR",
  "CAD",
  "GBP",
  "AUD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "INR",
  "JPY",
  "MYR",
  "SGD",
  "MXN",
  "BRL",
  "CHF",
  "IDR",
] as const;
export type OrderCurrency = (typeof ORDER_CURRENCIES)[number];

const money = z
  .union([
    z.number(),
    z.string().transform(Number),
    z.object({ value: z.union([z.number(), z.string().transform(Number)]) }),
  ])
  .transform((value) =>
    typeof value === "number" ? value : Number(value.value)
  )
  .pipe(z.number().finite());

const orderSchema = z.object({
  amounts: z
    .object({
      currency: z.string().optional(),
      orderTotal: money.optional(),
      totalRefunded: money.optional(),
    })
    .partial()
    .optional(),
  createdAt: z.string().optional(),
  friendlyId: z.string().min(1),
  fulfillmentStatus: z.string().nullish(),
  id: z.string().min(1),
  items: z
    .array(
      z.object({
        offerName: z.string().optional(),
        quantity: z.number().optional(),
        variantName: z.string().nullish(),
      })
    )
    .default([]),
  status: z.string(),
});

// An order as the products page shows it: no email, address or message
// (they stay in Fourthwall's admin).
export interface OrderSummary {
  id: string;
  friendlyId: string;
  status: string;
  fulfillmentStatus: string | null;
  // Cents, in the order's currency.
  totalCents: number | null;
  refundedCents: number | null;
  currency: string | null;
  createdAt: string | null;
  items: { name: string; quantity: number }[];
}

const toCents = (value: number | undefined) =>
  value === undefined ? null : Math.round(value * 100);

// Fourthwall pages orders 10 at a time at most.
export const ORDER_PAGE_SIZE = 10;

export const listOrders = async (
  call: ToolCall,
  { offerIds, page }: { offerIds?: string[] | undefined; page: number }
): Promise<OrderSummary[]> => {
  const reply = await call("ecommerce_get-orders", {
    page,
    size: ORDER_PAGE_SIZE,
    ...(offerIds === undefined || offerIds.length === 0 ? {} : { offerIds }),
  });
  const seen = new Set<string>();
  return findAll(orderSchema, reply).flatMap((order) => {
    if (seen.has(order.id)) {
      return [];
    }
    seen.add(order.id);
    return [
      {
        createdAt: order.createdAt ?? null,
        currency: order.amounts?.currency ?? null,
        friendlyId: order.friendlyId,
        fulfillmentStatus: order.fulfillmentStatus ?? null,
        id: order.id,
        items: order.items.map((item) => ({
          name: [item.offerName, item.variantName].filter(Boolean).join(" · "),
          quantity: item.quantity ?? 1,
        })),
        refundedCents: toCents(order.amounts?.totalRefunded),
        status: order.status,
        totalCents: toCents(order.amounts?.orderTotal),
      },
    ];
  });
};

const cancellationSchema = z.object({
  fullyCancellable: z.boolean(),
  notCancellableReason: z.string().nullish(),
  remainingRefundAmount: money.optional(),
  remainingRefundCurrency: z.string().optional(),
});

export interface Cancellation {
  cancellable: boolean;
  reason: string | null;
  remainingCents: number | null;
  currency: string | null;
}

// Whether the whole order can still be cancelled (it can't once production
// starts) and what is left to refund.
export const orderCancellation = async (
  call: ToolCall,
  orderId: string
): Promise<Cancellation> => {
  const found = findOne(
    cancellationSchema,
    await call("ecommerce_get-order-cancellation-by-ids", {
      orderIds: [orderId],
    }),
    "cancellation details"
  );
  return {
    cancellable: found.fullyCancellable,
    currency: found.remainingRefundCurrency ?? null,
    reason: found.notCancellableReason ?? null,
    remainingCents: toCents(found.remainingRefundAmount),
  };
};

// Both amounts are required: a reply without them must not read as "$0 to
// your card".
const costSchema = z.object({
  chargeAmount: money,
  fromBalance: money,
  maxRefundAvailable: money.optional(),
});

// What a refund or cancel would take from the shop's balance and charge to
// its card. Read-only: shown on the approval before anything moves.
export interface MoneyPreview {
  fromBalanceCents: number;
  chargeToCardCents: number;
  // What the customer gets back (cancels report it).
  refundCents: number | undefined;
}

const toPreview = (reply: unknown): MoneyPreview => {
  const cost = findOne(costSchema, reply, "cost preview");
  return {
    chargeToCardCents: Math.round(cost.chargeAmount * 100),
    fromBalanceCents: Math.round(cost.fromBalance * 100),
    refundCents: toCents(cost.maxRefundAvailable) ?? undefined,
  };
};

const major = (cents: number) => Math.round(cents) / 100;

export const previewRefund = async (
  call: ToolCall,
  {
    amountCents,
    currency,
    orderId,
  }: { amountCents: number; currency: OrderCurrency; orderId: string }
) =>
  toPreview(
    await call("ecommerce_preview-refund-cost", {
      amount: major(amountCents),
      currency,
      orderId,
    })
  );

export const previewCancel = async (call: ToolCall, orderId: string) =>
  toPreview(await call("ecommerce_preview-cancel-cost", { orderId }));

// IRREVERSIBLE. Called only by the executor of an approved
// store.order.refund, never retried.
export const refundOrder = async (
  call: ToolCall,
  {
    amountCents,
    currency,
    orderId,
    reason,
  }: {
    amountCents: number;
    currency: OrderCurrency;
    orderId: string;
    reason: string;
  }
) => {
  const reply = await call("ecommerce_refund-order", {
    amount: major(amountCents),
    currency,
    orderId,
    reason: reason.slice(0, 1024),
    type: "CreatorCaused",
  });
  throwBulkErrors(reply);
  return toPreview(reply);
};

// IRREVERSIBLE. Called only by the executor of an approved
// store.order.cancel, never retried. Cancels the whole order.
export const cancelOrder = async (
  call: ToolCall,
  { orderId, reason }: { orderId: string; reason: string }
) => {
  const reply = await call("ecommerce_cancel-order", { orderId, reason });
  throwBulkErrors(reply);
  return toPreview(reply);
};

// ---------------------------------------------------------------------------
// Variants: samples and per-size prices

const variantSchema = z.object({
  attributes: z.string().optional(),
  id: z.string().min(1),
  name: z.string().optional(),
  price: money.optional(),
  status: z.string().optional(),
});

export interface OfferVariant {
  id: string;
  name: string;
  size: string | undefined;
  priceCents: number | undefined;
}

const SIZE_ATTRIBUTE = /Size:\s*(?<size>[^,]+)/u;

// The size in Fourthwall's flat attribute string, e.g.
// "Color: Red (#FF0000), Size: 2XL" → "2XL".
export const sizeOf = (attributes: string | undefined) =>
  attributes?.match(SIZE_ATTRIBUTE)?.groups?.size?.trim();

// The offer's variants (Fourthwall returns the first 10).
export const offerVariants = async (
  call: ToolCall,
  offerId: string
): Promise<OfferVariant[]> => {
  const reply = await call("ecommerce_get-offers-by-ids", {
    offerIds: [offerId],
  });
  const [offer] = findAll(
    z.object({ id: z.literal(offerId), variants: z.array(z.unknown()) }),
    reply
  );
  return findAll(variantSchema, offer?.variants ?? [])
    .filter((variant) => variant.status !== "ARCHIVED")
    .map((variant) => ({
      id: variant.id,
      name: variant.name ?? variant.attributes ?? variant.id,
      priceCents: toCents(variant.price) ?? undefined,
      size: sizeOf(variant.attributes),
    }));
};

// Sets the base price on every variant, then the surcharged sizes the offer
// has (a size it lacks is not sent).
export const setSizePrices = async (
  call: ToolCall,
  offerId: string,
  price: number,
  bySize: { price: number; size: string }[]
) => {
  throwBulkErrors(
    await call("ecommerce_bulk-update-offer-variant-prices", {
      offerId,
      price,
    })
  );
  if (bySize.length === 0) {
    return;
  }
  const variants = await offerVariants(call, offerId);
  const sizes = new Set(
    variants.flatMap((variant) =>
      variant.size === undefined ? [] : [variant.size]
    )
  );
  const priceUpdates = bySize
    .filter((entry) => sizes.has(entry.size))
    .map((entry) => ({ attributeValue: entry.size, price: entry.price }));
  if (priceUpdates.length === 0) {
    return;
  }
  throwBulkErrors(
    await call("ecommerce_bulk-update-offer-variant-prices", {
      groupBy: "SIZE",
      offerId,
      priceUpdates,
    })
  );
};

// A checkout for the designer to order samples at cost: they pay on
// Fourthwall's page, wovain only prepares the link.
export const sampleCheckout = async (
  call: ToolCall,
  {
    baseUrl,
    items,
  }: { baseUrl: string; items: { variantId: string; quantity: number }[] }
) => {
  const reply = await call("ecommerce_create-sample-checkout", {
    items: items.map((item) => `${item.variantId}:${item.quantity}`).join(","),
  });
  throwBulkErrors(reply);
  const { checkoutPath } = findOne(
    z.object({ checkoutPath: z.string().min(1) }),
    reply,
    "sample checkout"
  );
  return new URL(checkoutPath, baseUrl).href;
};

// The shop's storefront URL.
export const shopBaseUrl = async (call: ToolCall) =>
  findOne(
    z.object({ baseUrl: z.url() }),
    await call("ecommerce_get-current-shop", {}),
    "shop"
  ).baseUrl;

// ---------------------------------------------------------------------------
// Site status: taking a coming-soon shop live (R3, the merchant confirms)

// Called only by the executor of an approved store.site.set_status.
export const setSiteLive = async (call: ToolCall) => {
  const reply = await call("ecommerce_update-shop-site-status", {
    status: "LIVE",
  });
  throwBulkErrors(reply);
  return findOne(z.object({ status: z.string() }), reply, "shop").status;
};

// ---------------------------------------------------------------------------
// Promotions and gift cards, as the Store page lists them

// Fourthwall pages promotions and gift cards 10 at a time at most.
export const LIST_PAGE_SIZE = 10;

const PROMOTION_STATUSES = ["LIVE", "ENDED", "ARCHIVED", "ALL_USED"] as const;

const promotionRowSchema = z.object({
  code: z.string().min(1).optional(),
  codes: z
    .array(z.union([z.string(), z.object({ code: z.string() })]))
    .optional(),
  discount: z.object({ percentage: money.optional() }).partial().optional(),
  id: z.string().min(1),
  percentage: money.optional(),
  status: z.enum(PROMOTION_STATUSES),
  type: z.string().optional(),
  usageCount: money.optional(),
});

export interface PromotionSummary {
  id: string;
  code: string;
  status: (typeof PROMOTION_STATUSES)[number];
  // Whole percent off, when the code is a percentage.
  percentage: number | null;
  uses: number | null;
}

const firstCode = (row: z.infer<typeof promotionRowSchema>) => {
  if (row.code !== undefined) {
    return row.code;
  }
  const [first] = row.codes ?? [];
  return typeof first === "object" ? first.code : first;
};

// The shop's discount codes, newest first. Membership promotions are left
// out: wovain doesn't run memberships.
export const listPromotions = async (
  call: ToolCall,
  { page }: { page: number }
): Promise<PromotionSummary[]> => {
  const reply = await call("ecommerce_get-promotions", {
    page,
    size: LIST_PAGE_SIZE,
  });
  const seen = new Set<string>();
  return findAll(promotionRowSchema, reply).flatMap((row) => {
    const code = firstCode(row);
    if (
      code === undefined ||
      seen.has(row.id) ||
      row.type?.startsWith("MEMBERSHIPS") === true
    ) {
      return [];
    }
    seen.add(row.id);
    return [
      {
        code,
        id: row.id,
        percentage: row.percentage ?? row.discount?.percentage ?? null,
        status: row.status,
        uses: row.usageCount ?? null,
      },
    ];
  });
};

const GIFT_CARD_STATUSES = [
  "UNUSED",
  "PARTIALLY_USED",
  "FULLY_USED",
  "EXPIRED",
  "DEACTIVATED",
  "ARCHIVED",
] as const;

const giftCardRowSchema = z.object({
  balance: z
    .object({ initial: money.optional(), remaining: money.optional() })
    .partial()
    .optional(),
  code: z.string().min(1).optional(),
  expiresAt: z.string().nullish(),
  id: z.string().min(1),
  status: z.enum(GIFT_CARD_STATUSES),
});

export interface GiftCardSummary {
  id: string;
  code: string | null;
  status: (typeof GIFT_CARD_STATUSES)[number];
  // Cents, in USD (gift cards are priced in the shop's USD).
  initialCents: number | null;
  remainingCents: number | null;
  expiresAt: string | null;
}

export const listGiftCards = async (
  call: ToolCall,
  { page }: { page: number }
): Promise<GiftCardSummary[]> => {
  const reply = await call("ecommerce_get-gift-cards", {
    page,
    size: LIST_PAGE_SIZE,
  });
  const seen = new Set<string>();
  return findAll(giftCardRowSchema, reply).flatMap((row) => {
    if (seen.has(row.id)) {
      return [];
    }
    seen.add(row.id);
    return [
      {
        code: row.code ?? null,
        expiresAt: row.expiresAt ?? null,
        id: row.id,
        initialCents: toCents(row.balance?.initial),
        remainingCents: toCents(row.balance?.remaining),
        status: row.status,
      },
    ];
  });
};

// Fourthwall's bounds: $1 to $2,000 a card, 1 to 50 cards at a time.
export const GIFT_CARD_MAX_USD = 2000;
export const GIFT_CARD_MAX_COUNT = 50;

// IRREVERSIBLE (store credit is money). Called only by the executor of an
// approved store.gift_card.create, never retried.
export const createGiftCards = async (
  call: ToolCall,
  {
    amountUsd,
    count,
    expiresAt,
  }: { amountUsd: number; count: number; expiresAt?: string | undefined }
) => {
  throwBulkErrors(
    await call("ecommerce_create-gift-cards", {
      amount: amountUsd,
      numberOfCards: count,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    })
  );
  return { count };
};
