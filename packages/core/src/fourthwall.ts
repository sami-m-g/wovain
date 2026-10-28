import { setTimeout as delay } from "node:timers/promises";

import { createError } from "evlog";
import { z } from "zod";

import type { Artwork } from "./design";
import { findAll, findOne } from "./upstream";
import type { ToolCall } from "./upstream";

// The merchant's Fourthwall shop through its MCP server: browse the catalog,
// upload a design to the media library, create the product (hidden, priced
// by wovain) and publish it. Replies are untrusted data from the merchant's
// account; only fields with the expected shape are read.

const printAreaSchema = z.object({
  name: z.string(),
  supportsBackendRendering: z.boolean(),
  type: z.string(),
});

const catalogSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  priceFrom: z.number().optional(),
  printDetails: z
    .object({
      printAreas: z.array(printAreaSchema),
      supportsBackendRendering: z.boolean(),
    })
    .optional(),
  slug: z.string().min(1),
});

export interface CatalogProduct {
  // The blank's cost from Fourthwall, when listed.
  baseCost: number | undefined;
  id: string;
  name: string;
  // The front print area wovain renders designs on.
  region: string;
  slug: string;
}

// A large front print where the product has one, else any front print.
const frontRegion = (areas: z.infer<typeof printAreaSchema>[]) => {
  const front = areas.filter(
    (area) => area.supportsBackendRendering && area.type.startsWith("front")
  );
  return (front.find((area) => area.type === "front_large") ?? front[0])?.type;
};

const REPLY_PREVIEW = 200;
const MAX_KEYS = 10;

// What a catalog reply held, for the error log: never the products' content.
const summarizeReply = (reply: unknown, renderable: number) => {
  const shape = Array.isArray(reply) ? "array" : typeof reply;
  const keys =
    typeof reply === "object" && reply !== null
      ? Object.keys(reply).slice(0, MAX_KEYS).join(",")
      : "";
  const listed = findAll(catalogSchema, reply).length;
  const preview =
    typeof reply === "string" ? ` text="${reply.slice(0, REPLY_PREVIEW)}"` : "";
  return `${shape}${keys === "" ? "" : ` keys=[${keys}]`} products=${listed} renderable=${renderable}${preview}`;
};

interface CatalogResult {
  blanks: CatalogProduct[];
  summary: string;
}

const queryCatalog = async (
  call: ToolCall,
  { productId, query = "t-shirt" }: { productId?: string; query?: string }
): Promise<CatalogResult> => {
  const reply = await call("ecommerce_get-catalog-products", {
    includePrintDetails: true,
    page: 0,
    size: 10,
    sortingMethod: "MOST_POPULAR",
    ...(productId === undefined ? { query } : { productIds: [productId] }),
  });
  const blanks = findAll(catalogSchema, reply).flatMap((product) => {
    const details = product.printDetails;
    const region =
      details?.supportsBackendRendering === true
        ? frontRegion(details.printAreas)
        : undefined;
    return region === undefined
      ? []
      : [
          {
            baseCost: product.priceFrom,
            id: product.id,
            name: product.name,
            region,
            slug: product.slug,
          },
        ];
  });
  return { blanks, summary: summarizeReply(reply, blanks.length) };
};

// Catalog blanks that Fourthwall can render a design on, most popular first.
// One blank by its ID, or a search ("t-shirt" by default).
export const searchCatalog = async (
  call: ToolCall,
  options: { productId?: string; query?: string } = {}
): Promise<CatalogProduct[]> => {
  const { blanks } = await queryCatalog(call, options);
  return blanks;
};

const BLANK_ATTEMPTS = 3;
const BLANK_RETRY_MS = 400;

// One blank to print on. A reply with nothing usable is retried (Fourthwall
// can answer a good call with an empty page); a search that stays empty falls
// back to the default blank (FOURTHWALL_DEFAULT_PRODUCT_ID, a front-printable
// tee Fourthwall lists for every shop). A blank that can't be found is an
// error that says what Fourthwall answered.
export const pickBlank = async (
  call: ToolCall,
  {
    defaultProductId,
    productId,
    retryMs = BLANK_RETRY_MS,
  }: { defaultProductId: string; productId?: string; retryMs?: number }
): Promise<CatalogProduct> => {
  const tried: string[] = [];
  const attempt = async (
    id: string | undefined,
    n = 1
  ): Promise<CatalogProduct | undefined> => {
    const { blanks, summary } = await queryCatalog(
      call,
      id === undefined ? {} : { productId: id }
    );
    const [blank] = blanks;
    if (blank !== undefined) {
      return blank;
    }
    tried.push(`${id ?? "search"} #${n}: ${summary}`);
    if (n >= BLANK_ATTEMPTS) {
      return undefined;
    }
    await delay(retryMs);
    return await attempt(id, n + 1);
  };
  const found =
    (await attempt(productId)) ??
    (productId === undefined ? await attempt(defaultProductId) : undefined);
  if (found !== undefined) {
    return found;
  }
  throw createError({
    code: "FOURTHWALL_NO_BLANK",
    fix:
      productId === undefined
        ? "Reconnect Fourthwall, then retry."
        : "Pick another catalog product.",
    internal: { replies: tried },
    message:
      productId === undefined
        ? "Fourthwall's catalog returned no product that can print this design"
        : "That Fourthwall product can't print this design",
    status: 412,
    why: tried.join(" | "),
  });
};

// Per-item failures sit next to the successes in Fourthwall's bulk replies.
export const throwBulkErrors = (reply: unknown) => {
  const [failed] = findAll(z.object({ bulkError: z.string().min(1) }), reply);
  if (failed !== undefined) {
    throw new Error(`Fourthwall refused: ${failed.bulkError.slice(0, 200)}`);
  }
};

// The working upload route: a signed URL, a PUT, the confirm, then the media
// library, whose CDN URI is what design previews accept.
export const uploadArtwork = async (
  call: ToolCall,
  artwork: Artwork,
  fetchFn: typeof fetch = fetch
) => {
  const image = await fetchFn(artwork.url);
  if (!image.ok) {
    throw new Error(`Couldn't download the artwork (${image.status})`);
  }
  const upload = findOne(
    z.object({ signedUrl: z.url(), uploadId: z.string().min(1) }),
    await call("request-upload-url", {
      contentType: "image/png",
      filename: `wovain-${Date.now()}.png`,
    }),
    "upload URL"
  );
  const put = await fetchFn(upload.signedUrl, {
    body: await image.arrayBuffer(),
    headers: { "Content-Type": "image/png" },
    method: "PUT",
  });
  if (!put.ok) {
    throw new Error(`Fourthwall's upload URL refused the file (${put.status})`);
  }
  const confirmed = findOne(
    z.object({ url: z.string().min(1) }),
    await call("confirm-image-upload", { uploadId: upload.uploadId }),
    "confirmed upload"
  );
  const saved = findOne(
    z.object({ uri: z.url() }),
    await call("ecommerce_save-media-library-image", {
      height: artwork.height,
      uri: confirmed.url,
      width: artwork.width,
    }),
    "media library image"
  );
  return saved.uri;
};

const mockupSchema = z.union([z.url(), z.object({ url: z.url() })]);

export interface NewProduct {
  catalogProductId: string;
  description: string;
  mediaUri: string;
  price: number;
  region: string;
  title: string;
}

export interface DesignPreview {
  customizationId: string;
  mockups: string[];
}

// Renders the design on the blank: the customization the product is made
// from, and its mockups.
export const previewDesign = async (
  call: ToolCall,
  product: Pick<NewProduct, "catalogProductId" | "mediaUri" | "region">
): Promise<DesignPreview> => {
  const previews = await call("ecommerce_generate-product-design-previews", {
    products: [
      {
        productId: product.catalogProductId,
        regionNames: [product.region],
        regionUrls: [product.mediaUri],
      },
    ],
  });
  throwBulkErrors(previews);
  const preview = findOne(
    z.object({
      customizationId: z.string().min(1),
      images: z.array(mockupSchema).default([]),
    }),
    previews,
    "design preview"
  );
  return {
    customizationId: preview.customizationId,
    mockups: preview.images.map((image) =>
      typeof image === "string" ? image : image.url
    ),
  };
};

// Creates the product from a customization; Fourthwall creates it hidden.
export const createOffer = async (
  call: ToolCall,
  {
    customizationId,
    description,
    title,
  }: { customizationId: string; description: string; title: string }
) => {
  const created = await call("ecommerce_create-offers-from-designs", {
    customizationIds: [customizationId],
    offerDescriptions: [description],
    offerNames: [title],
  });
  throwBulkErrors(created);
  return findOne(z.object({ offerId: z.string().min(1) }), created, "offer")
    .offerId;
};

// The product an earlier, unanswered createOffer made, if it made one:
// Fourthwall keeps the customization it was created from.
export const findOffer = async (
  call: ToolCall,
  { customizationId, title }: { customizationId: string; title: string }
) => {
  const reply = await call("ecommerce_get-offers", {
    page: 0,
    searchPhrase: title,
    size: 10,
    sortDirection: "DESC",
    sortField: "CREATED_AT",
  });
  return findAll(
    z.object({ customizationId: z.string().nullish(), id: z.string().min(1) }),
    reply
  ).find((offer) => offer.customizationId === customizationId)?.id;
};

// Sets wovain's price on every variant; setting it twice is harmless.
export const setOfferPrice = async (
  call: ToolCall,
  offerId: string,
  price: number
) => {
  throwBulkErrors(
    await call("ecommerce_bulk-update-offer-variant-prices", {
      offerId,
      price,
    })
  );
};

// Renders the design on the blank, creates the product (Fourthwall creates it
// hidden) and sets wovain's price on every variant.
export const createProduct = async (call: ToolCall, product: NewProduct) => {
  const preview = await previewDesign(call, product);
  const offerId = await createOffer(call, {
    customizationId: preview.customizationId,
    description: product.description,
    title: product.title,
  });
  await setOfferPrice(call, offerId, product.price);
  return { ...preview, offerId };
};

// Makes the product public and returns its storefront page.
export const publishProduct = async (call: ToolCall, offerId: string) => {
  throwBulkErrors(
    await call("ecommerce_update-offer-status", { offerId, status: "PUBLIC" })
  );
  const [shop, offers] = await Promise.all([
    call("ecommerce_get-current-shop", {}),
    call("ecommerce_get-offers-by-ids", { offerIds: [offerId] }),
  ]);
  const { baseUrl } = findOne(z.object({ baseUrl: z.url() }), shop, "shop");
  const offer = findAll(
    z.object({ id: z.string(), slug: z.string() }),
    offers
  ).find((item) => item.id === offerId);
  if (offer === undefined) {
    throw new Error("Fourthwall didn't return the published product");
  }
  return new URL(`/products/${offer.slug}`, baseUrl).href;
};
