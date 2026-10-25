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

// Catalog blanks that Fourthwall can render a design on, most popular first.
// One blank by its ID, or a search ("t-shirt" by default).
export const searchCatalog = async (
  call: ToolCall,
  { productId, query = "t-shirt" }: { productId?: string; query?: string } = {}
): Promise<CatalogProduct[]> => {
  const reply = await call("ecommerce_get-catalog-products", {
    includePrintDetails: true,
    page: 0,
    size: 10,
    sortingMethod: "MOST_POPULAR",
    ...(productId === undefined ? { query } : { productIds: [productId] }),
  });
  return findAll(catalogSchema, reply).flatMap((product) => {
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
};

// Per-item failures sit next to the successes in Fourthwall's bulk replies.
const throwBulkErrors = (reply: unknown) => {
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

// Renders the design on the blank, creates the product (Fourthwall creates it
// hidden) and sets wovain's price on every variant.
export const createProduct = async (call: ToolCall, product: NewProduct) => {
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
  const created = await call("ecommerce_create-offers-from-designs", {
    customizationIds: [preview.customizationId],
    offerDescriptions: [product.description],
    offerNames: [product.title],
  });
  throwBulkErrors(created);
  const { offerId } = findOne(
    z.object({ offerId: z.string().min(1) }),
    created,
    "offer"
  );
  throwBulkErrors(
    await call("ecommerce_bulk-update-offer-variant-prices", {
      offerId,
      price: product.price,
    })
  );
  return {
    customizationId: preview.customizationId,
    mockups: preview.images.map((image) =>
      typeof image === "string" ? image : image.url
    ),
    offerId,
  };
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
