import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

// What the optimizer takes from Fourthwall and Meta webhooks
// (docs/changes/25-optimizer/spec.md, section 2). Payloads are parsed loosely:
// only the fields the rules read are named, and everything else (names,
// emails, addresses) is dropped before an event is stored.

export const fourthwallEventTypes = [
  "ORDER_PLACED",
  "ORDER_UPDATED",
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PROMOTION_STATUS_CHANGED",
  "CART_ABANDONED_1H",
  "CART_ABANDONED_24H",
  "CART_ABANDONED_72H",
  "PLATFORM_APP_DISCONNECTED",
] as const;
export type FourthwallEventType = (typeof fourthwallEventTypes)[number];

// Fourthwall's envelope: `id` dedupes, `shopId` routes, `testMode` events are
// stored but never acted on.
export const fourthwallEventSchema = z.looseObject({
  createdAt: z.string().optional(),
  data: z.unknown(),
  id: z.string().min(1).max(200),
  shopId: z.string().min(1).max(200),
  testMode: z.boolean().default(false),
  type: z.string().min(1).max(100),
});
export type FourthwallEvent = z.infer<typeof fourthwallEventSchema>;

export const orderStatuses = [
  "CONFIRMED",
  "PARTIALLY_IN_PRODUCTION",
  "IN_PRODUCTION",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "CANCELLED",
  "COMPLETED",
] as const;
export const orderStatusSchema = z.enum(orderStatuses);

const moneySchema = z.looseObject({
  currency: z.string().optional(),
  value: z.number(),
});
const attributesSchema = z
  .looseObject({
    color: z.looseObject({ name: z.string() }).optional(),
    size: z.looseObject({ name: z.string() }).optional(),
  })
  .optional();

const fwOrderSchema = z.looseObject({
  amounts: z.looseObject({ total: moneySchema }).optional(),
  createdAt: z.string().optional(),
  email: z.string().optional(),
  id: z.string(),
  offers: z
    .array(
      z.looseObject({
        id: z.string(),
        variant: z.looseObject({
          attributes: attributesSchema,
          id: z.string(),
          quantity: z.int().min(0).default(1),
          unitPrice: moneySchema.optional(),
        }),
      })
    )
    .default([]),
  status: orderStatusSchema.or(z.string()),
  trackingParams: z.record(z.string(), z.string()).optional(),
});

const fwProductSchema = z.looseObject({
  id: z.string(),
  state: z.looseObject({ type: z.string() }).optional(),
  variants: z
    .array(
      z.looseObject({
        attributes: attributesSchema,
        id: z.string(),
        stock: z
          .looseObject({
            inStock: z.number().optional(),
            type: z.string(),
          })
          .optional(),
      })
    )
    .default([]),
});

// The stored, PII-free fields per event kind.
const utmSchema = z.object({
  campaign: z.string().optional(),
  content: z.string().optional(),
  medium: z.string().optional(),
  source: z.string().optional(),
});
export const stockStates = ["unlimited", "in_stock", "out_of_stock"] as const;

export const eventFieldsSchema = z.discriminatedUnion("kind", [
  z.object({
    currency: z.string().optional(),
    // A per-shop hash of the buyer's email: repeat rate without the email.
    customerKey: z.string().optional(),
    items: z.array(
      z.object({
        color: z.string().optional(),
        offerId: z.string(),
        quantity: z.int().min(0),
        size: z.string().optional(),
        unitPrice: z.number().optional(),
        variantId: z.string(),
      })
    ),
    kind: z.literal("order"),
    orderId: z.string(),
    placedAt: z.string().optional(),
    status: z.string(),
    total: z.number().optional(),
    update: z.string().optional(),
    // Firestore drops an empty map, so a stored order may have no utm.
    utm: utmSchema.prefault({}),
  }),
  z.object({
    kind: z.literal("product"),
    productId: z.string(),
    state: z.string().optional(),
    variants: z.array(
      z.object({
        color: z.string().optional(),
        size: z.string().optional(),
        stock: z.enum(stockStates),
        variantId: z.string(),
      })
    ),
  }),
  z.object({
    kind: z.literal("promotion"),
    promotionId: z.string().optional(),
    status: z.string().optional(),
  }),
  z.object({
    afterHours: z.int(),
    items: z.array(
      z.object({ offerId: z.string().optional(), quantity: z.int().min(0) })
    ),
    kind: z.literal("cart"),
  }),
  z.object({ kind: z.literal("disconnected") }),
  z.object({
    accountId: z.string(),
    field: z.string(),
    kind: z.literal("meta"),
    objectId: z.string().optional(),
    value: z.unknown(),
  }),
  // A payload whose shape didn't match: kept as a marker, so the poll reads
  // the source instead.
  z.object({ kind: z.literal("unparsed") }),
]);
export type EventFields = z.infer<typeof eventFieldsSchema>;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// The idempotency keys events are stored under (Firestore document ids).
export const fourthwallEventKey = (eventId: string) =>
  `fourthwall-${sha256(eventId).slice(0, 40)}`;

// Meta changes have no id: account, field, object, value and time make one.
export const metaChangeKey = (change: {
  accountId: string;
  field: string;
  objectId?: string | undefined;
  time: number;
  value: unknown;
}) =>
  `meta-${sha256(
    JSON.stringify([
      change.accountId,
      change.field,
      change.objectId ?? "",
      change.value,
      change.time,
    ])
  ).slice(0, 40)}`;

// A change the reconciliation poll found that no webhook delivered.
export const pollEventKey = (kind: string, id: string, version: string) =>
  `poll-${sha256(JSON.stringify([kind, id, version])).slice(0, 40)}`;

// The server-side secret customer keys are made with. Required and non-empty:
// a plain hash of an email can be reversed by hashing guessed emails.
const secretOf = (secret: string) => {
  if (secret.length === 0) {
    throw new Error("A customer key secret is required");
  }
  return secret;
};

// A per-shop customer key: HMAC-SHA256 of the shop and the normalized email,
// keyed with a server-side secret.
export const customerKeyOf = (secret: string, shopId: string, email: string) =>
  createHmac("sha256", secretOf(secret))
    .update(`${shopId}:${email.trim().toLowerCase()}`)
    .digest("hex");

const utmOf = (params: Record<string, string> | undefined) => {
  const read = (snake: string, camel: string) =>
    params?.[snake] ?? params?.[camel];
  return utmSchema.parse({
    campaign: read("utm_campaign", "utmCampaign"),
    content: read("utm_content", "utmContent"),
    medium: read("utm_medium", "utmMedium"),
    source: read("utm_source", "utmSource"),
  });
};

const orderFields = (
  secret: string,
  shopId: string,
  order: z.infer<typeof fwOrderSchema>,
  update?: string
): EventFields => ({
  currency: order.amounts?.total.currency,
  customerKey:
    order.email === undefined
      ? undefined
      : customerKeyOf(secret, shopId, order.email),
  items: order.offers.map(({ id, variant }) => ({
    color: variant.attributes?.color?.name,
    offerId: id,
    quantity: variant.quantity,
    size: variant.attributes?.size?.name,
    unitPrice: variant.unitPrice?.value,
    variantId: variant.id,
  })),
  kind: "order",
  orderId: order.id,
  placedAt: order.createdAt,
  status: order.status,
  total: order.amounts?.total.value,
  update,
  utm: utmOf(order.trackingParams),
});

const stockOf = (
  stock: { inStock?: number | undefined; type: string } | undefined
) => {
  if (stock === undefined || stock.type.toUpperCase() === "UNLIMITED") {
    return "unlimited" as const;
  }
  return (stock.inStock ?? 0) > 0
    ? ("in_stock" as const)
    : ("out_of_stock" as const);
};

const productFields = (product: z.infer<typeof fwProductSchema>) => ({
  kind: "product" as const,
  productId: product.id,
  state: product.state?.type,
  variants: product.variants.map((variant) => ({
    color: variant.attributes?.color?.name,
    size: variant.attributes?.size?.name,
    stock: stockOf(variant.stock),
    variantId: variant.id,
  })),
});

// Fourthwall wraps some payloads (`{ order }`, `{ product }`); others aren't.
const nested = <T extends z.ZodType>(schema: T, key: string, data: unknown) => {
  const wrapped = z.looseObject({ [key]: schema }).safeParse(data);
  return wrapped.success
    ? schema.safeParse(wrapped.data[key])
    : schema.safeParse(data);
};

const unparsed: EventFields = { kind: "unparsed" };

const cartHours: Partial<Record<string, number>> = {
  CART_ABANDONED_1H: 1,
  CART_ABANDONED_24H: 24,
  CART_ABANDONED_72H: 72,
};

const cartSchema = z.looseObject({
  items: z
    .array(
      z.looseObject({
        offer: z.looseObject({ id: z.string() }).optional(),
        quantity: z.int().min(0).default(1),
      })
    )
    .default([]),
});

const promotionSchema = z.looseObject({
  id: z.string().optional(),
  status: z.string().optional(),
});

const orderUpdateSchema = z.looseObject({
  update: z.looseObject({ type: z.string() }).optional(),
});

// One Fourthwall event's stored fields, PII dropped. `customerSecret` keys
// the buyer's customer key (customerKeyOf); an empty one is refused.
export const fourthwallFields = (
  event: FourthwallEvent,
  customerSecret: string
): EventFields => {
  const secret = secretOf(customerSecret);
  const { data, shopId, type } = event;
  if (type === "ORDER_PLACED" || type === "ORDER_UPDATED") {
    const order = nested(fwOrderSchema, "order", data);
    const update = orderUpdateSchema.safeParse(data).data?.update?.type;
    return order.success
      ? orderFields(secret, shopId, order.data, update)
      : unparsed;
  }
  if (type === "PRODUCT_CREATED" || type === "PRODUCT_UPDATED") {
    const product = nested(fwProductSchema, "product", data);
    return product.success ? productFields(product.data) : unparsed;
  }
  if (type === "PROMOTION_STATUS_CHANGED") {
    const promotion = nested(promotionSchema, "promotion", data);
    return promotion.success
      ? {
          kind: "promotion",
          promotionId: promotion.data.id,
          status: promotion.data.status,
        }
      : unparsed;
  }
  const afterHours = cartHours[type];
  if (afterHours !== undefined) {
    const cart = nested(cartSchema, "cart", data);
    return cart.success
      ? {
          afterHours,
          items: cart.data.items.map((item) => ({
            offerId: item.offer?.id,
            quantity: item.quantity,
          })),
          kind: "cart",
        }
      : unparsed;
  }
  return type === "PLATFORM_APP_DISCONNECTED"
    ? { kind: "disconnected" }
    : unparsed;
};

// Meta's ads webhooks: up to 1000 changes per delivery on `ad_account`.
export const metaWebhookSchema = z.object({
  entry: z
    .array(
      z.looseObject({
        changes: z
          .array(
            z.looseObject({ field: z.string().max(100), value: z.unknown() })
          )
          .max(1000),
        id: z.string().max(100),
        time: z.number(),
      })
    )
    .max(1000),
  object: z.string(),
});
export type MetaWebhook = z.infer<typeof metaWebhookSchema>;

const idSchema = z.union([z.string(), z.number()]).optional();
const objectIdsSchema = z.looseObject({
  ad_id: idSchema,
  id: idSchema,
  object_id: idSchema,
});
const objectIdOf = (value: unknown) => {
  const ids = objectIdsSchema.safeParse(value).data;
  const id = ids?.id ?? ids?.object_id ?? ids?.ad_id;
  return id === undefined ? undefined : String(id);
};

// Each change in a delivery, with its key and the ad account it routes to
// (`act_` stripped, as `metaAdAccounts/{id}` stores it).
export const metaChanges = (body: MetaWebhook) =>
  body.entry.flatMap((entry) =>
    entry.changes.map((change) => {
      const fields = {
        accountId: entry.id.replace(/^act_/u, ""),
        field: change.field,
        objectId: objectIdOf(change.value),
        time: entry.time,
        value: change.value,
      };
      return { ...fields, key: metaChangeKey(fields) };
    })
  );

export const eventSources = [
  "fourthwall",
  "meta",
  "poll",
  "trend",
  "wovain",
] as const;

// users/{uid}/optimization/state/events/{key}. The store adds the TTL field
// (30 days) as a Firestore timestamp; it isn't part of this shape.
export const storedEventSchema = z.object({
  externalId: z.string().optional(),
  fields: eventFieldsSchema,
  key: z.string(),
  processedAt: z.int().optional(),
  receivedAt: z.int(),
  source: z.enum(eventSources),
  testMode: z.boolean().default(false),
  type: z.string(),
});
export type StoredEvent = z.infer<typeof storedEventSchema>;
