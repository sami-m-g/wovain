import type { CallToolResult } from "@modelcontextprotocol/client";
import type { Design } from "@wovain/shared/design";
import { z } from "zod";

import type { Upstream } from "./upstream.ts";

// A reason the merchant can read on the widget: Fourthwall's refusal, or a
// connection that needs renewing. Any other failure stays a generic message.
export class PublishRefusedError extends Error {
  override name = "PublishRefusedError";
}

// One Fourthwall tool call on the merchant's shop, returning its data.
export type FourthwallCall = (
  tool: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const REASON_CHARS = 200;

// The reply's first text part: where Fourthwall puts its JSON or its reason.
const textOf = (result: Pick<CallToolResult, "content">) =>
  result.content.find((part) => part.type === "text")?.text ?? "";

// A tool result's data: its structured content, else the JSON in its text.
// Fourthwall's text is data from the merchant's account, never instructions.
const replyData = (result: CallToolResult): unknown => {
  if (result.isError === true) {
    throw new PublishRefusedError(
      textOf(result).slice(0, REASON_CHARS) || "Fourthwall refused the change"
    );
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const body = textOf(result);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

// Every value in a reply, at any depth, that the schema accepts. Fourthwall
// documents its fields but not the envelope around them.
export const find = <T>(schema: z.ZodType<T>, value: unknown): T[] => {
  const parsed = schema.safeParse(value);
  const own = parsed.success ? [parsed.data] : [];
  if (typeof value !== "object" || value === null) {
    return own;
  }
  return [
    ...own,
    ...Object.values(value).flatMap((child) => find(schema, child)),
  ];
};

export const shopSchema = z.object({ baseUrl: z.url() });
const createdSchema = z.object({
  customizationId: z.string(),
  offerId: z.string().min(1),
});
const failedSchema = z.object({
  bulkError: z.string().min(1),
  customizationId: z.string(),
});
const offerSchema = z.object({ id: z.string(), slug: z.string().min(1) });
const collectionSchema = z.object({
  id: z.string().min(1),
  offerIds: z.array(z.string()),
  slug: z.string().min(1),
});

// The merchant's Fourthwall through wovain's connection to it.
export const fourthwallCaller =
  (upstream: Upstream, userId: string): FourthwallCall =>
  async (tool, args) => {
    const outcome = await upstream.call({
      args,
      id: "fourthwall",
      tool,
      userId,
    });
    if (outcome.kind === "connect") {
      throw new PublishRefusedError(
        "wovain's access to Fourthwall expired. Reconnect Fourthwall, then press Try again."
      );
    }
    return replyData(outcome.result);
  };

interface Product {
  customizationId: string;
  listing: Design["listing"];
  offerId?: string | undefined;
  quote: Design["quote"];
}

const productsOf = (design: Design): Product[] => [
  { ...design, offerId: design.productId },
  ...design.range,
];

const titles = (products: Product[]) =>
  products.map((product) => product.listing.title).join(", ");

// The design with each product's offer id from create-offers-from-designs.
const withOffers = (design: Design, ids: Map<string, string>): Design => {
  const heroId = design.productId ?? ids.get(design.customizationId);
  return {
    ...design,
    ...(heroId === undefined ? {} : { productId: heroId }),
    range: design.range.map((product) => {
      const offerId = product.offerId ?? ids.get(product.customizationId);
      return offerId === undefined ? product : { ...product, offerId };
    }),
  };
};

// Creates the products not created on an earlier try, hidden.
const createOffers = async (design: Design, call: FourthwallCall) => {
  const missing = productsOf(design).filter(
    (product) => product.offerId === undefined
  );
  if (missing.length === 0) {
    return { design, reasons: [] };
  }
  const reply = await call("ecommerce_create-offers-from-designs", {
    customizationIds: missing.map((product) => product.customizationId),
    offerDescriptions: missing.map((product) => product.listing.description),
    offerNames: missing.map((product) => product.listing.title),
  });
  const ids = new Map(
    find(createdSchema, reply).map((item) => [
      item.customizationId,
      item.offerId,
    ])
  );
  const reasons = find(failedSchema, reply).map((item) => item.bulkError);
  return { design: withOffers(design, ids), reasons };
};

const pageUrl = (
  shopUrl: string | undefined,
  kind: "collections" | "products",
  slug: string | undefined
) =>
  shopUrl === undefined || slug === undefined
    ? undefined
    : new URL(`/${kind}/${slug}`, shopUrl).href;

// Groups a drop in one collection, made public. A collection made on an
// earlier try is reused.
const publishCollection = async (
  design: Design,
  offerIds: string[],
  { call, save }: Pick<PublishDeps, "call" | "save">
) => {
  const reply =
    design.collectionId === undefined
      ? await call("ecommerce_create-collection", {
          available: true,
          description: design.listing.description,
          name: design.dropName ?? design.idea,
          offerIds,
        })
      : undefined;
  const [created] = find(collectionSchema, reply);
  const collectionId = design.collectionId ?? created?.id;
  if (collectionId === undefined) {
    throw new PublishRefusedError(
      "Fourthwall didn't create the drop's collection."
    );
  }
  await save({ collectionId });
  const [published] = find(
    collectionSchema,
    await call("ecommerce_update-collection-state", {
      collectionId,
      shouldUpdateOffersStatus: false,
      state: "PUBLIC",
    })
  );
  return { collectionId, slug: published?.slug ?? created?.slug };
};

export interface PublishDeps {
  call: FourthwallCall;
  // Saves progress, so a retry skips what already exists.
  save: (patch: Partial<Design>) => Promise<unknown>;
  shopUrl: string | undefined;
}

// Publishes an approved design: every product of the drop created, priced at
// the widget's price and made public, then a drop grouped in a collection.
// Returns the patch that makes the design live.
export const publishDesign = async (
  approved: Design,
  { call, save, shopUrl }: PublishDeps
): Promise<Partial<Design>> => {
  const { design, reasons } = await createOffers(approved, call);
  const { productId, range } = design;
  await save({ ...(productId === undefined ? {} : { productId }), range });
  const products = productsOf(design);
  const missing = products.filter((product) => product.offerId === undefined);
  if (missing.length > 0) {
    throw new PublishRefusedError(
      `Fourthwall didn't create ${titles(missing)}${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`.slice(
        0,
        REASON_CHARS
      )
    );
  }
  const offerIds = products.flatMap((product) => product.offerId ?? []);
  await Promise.all(
    products.map(async ({ offerId, quote }) => {
      await call("ecommerce_bulk-update-offer-variant-prices", {
        offerId,
        price: quote.price,
      });
      await call("ecommerce_update-offer-status", {
        offerId,
        status: "PUBLIC",
      });
    })
  );
  const slugs = new Map(
    find(
      offerSchema,
      await call("ecommerce_get-offers-by-ids", { offerIds })
    ).map((offer) => [offer.id, offer.slug])
  );
  const productPage = (offerId: string | undefined) =>
    pageUrl(
      shopUrl,
      "products",
      offerId === undefined ? undefined : slugs.get(offerId)
    );
  const liveRange = range.map((product) => {
    const productUrl = productPage(product.offerId);
    return productUrl === undefined ? product : { ...product, productUrl };
  });
  const collection =
    range.length > 0
      ? await publishCollection(design, offerIds, { call, save })
      : undefined;
  const productUrl =
    collection === undefined
      ? productPage(productId)
      : pageUrl(shopUrl, "collections", collection.slug);
  return {
    ...(collection === undefined
      ? {}
      : { collectionId: collection.collectionId }),
    ...(productUrl === undefined ? {} : { productUrl }),
    range: liveRange,
  };
};
