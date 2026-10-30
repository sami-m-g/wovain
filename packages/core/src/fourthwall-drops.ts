import { log as evlog } from "evlog";
import { z } from "zod";

import { findAll, findOne, replyShape } from "./upstream";
import type { ToolCall } from "./upstream";

// The Fourthwall calls a drop needs (openspec design-drops): blanks with
// their print areas, placements, colors and sizes; a preview with every
// region, placement, color and size; the real cost of the customization;
// and the collection the drop is published as. Replies are untrusted data
// from the merchant's shop: only fields with the expected shape are read.

const NOT_AMOUNT = /[^\d.]/gu;

export const money = z.union([
  z.number(),
  z.string().transform((value, ctx) => {
    const digits = value.replaceAll(NOT_AMOUNT, "");
    const parsed = Number(digits);
    if (digits === "" || Number.isNaN(parsed)) {
      ctx.addIssue({ code: "custom", message: "not a price" });
      return z.NEVER;
    }
    return parsed;
  }),
  z.object({ value: z.number() }).transform((value) => value.value),
  z.object({ amount: z.number() }).transform((value) => value.amount),
]);

const placementSchema = z.object({ id: z.string().min(1), name: z.string() });

// A field wovain can do without never rejects a blank: spelled another way
// (a price as an object, a placement without a name), it reads as missing
// and the blank still prints. Every reply's blank failed to parse otherwise.
/* oxlint-disable promise/prefer-await-to-then, promise/valid-params -- zod's catch, not a promise */
const printAreaSchema = z.object({
  name: z.string().catch(""),
  placements: z.array(placementSchema).nullish().default([]).catch([]),
  required: z.boolean().nullish().default(false),
  // The area's own price, e.g. "$8.50".
  salePrice: money.nullish().catch(null),
  supportsBackendRendering: z.boolean(),
  type: z.string().min(1),
});
export type PrintArea = z.infer<typeof printAreaSchema>;

const blankSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch(""),
  priceFrom: money.nullish().catch(null),
  /* oxlint-enable promise/prefer-await-to-then, promise/valid-params */
  printDetails: z.object({
    printAreas: z.array(printAreaSchema),
    supportsBackendRendering: z.boolean(),
  }),
  slug: z.string().min(1),
});

export interface Blank {
  // The blank's cost from Fourthwall, dollars, when listed.
  baseCost: number | undefined;
  id: string;
  name: string;
  // Only the areas Fourthwall can render a preview on.
  printAreas: PrintArea[];
  slug: string;
}

export interface BlankQuery {
  printRegions?: string[] | undefined;
  productionMethods?: string[] | undefined;
  query: string;
}

const SEARCH_SIZE = 5;

// A catalog read that found nothing to print on, logged with the reply's
// shape (keys and types, never values) so the cause reaches Error Tracking.
export const logEmptyCatalog = (what: string, summary: string) => {
  evlog.error({
    error: {
      code: "FOURTHWALL_CATALOG_EMPTY",
      message: `Fourthwall's catalog listed no renderable blank for ${what}: ${summary}`,
      name: "FourthwallCatalogEmpty",
    },
  });
};

// Blanks for a product kind, most popular first, that Fourthwall can render
// a design on.
export const searchBlanks = async (
  call: ToolCall,
  { printRegions, productionMethods, query }: BlankQuery
): Promise<Blank[]> => {
  const reply = await call("ecommerce_get-catalog-products", {
    includePrintDetails: true,
    page: 0,
    query,
    size: SEARCH_SIZE,
    sortingMethod: "MOST_POPULAR",
    ...(printRegions === undefined ? {} : { printRegions }),
    ...(productionMethods === undefined ? {} : { productionMethods }),
  });
  const listed = findAll(blankSchema, reply);
  const blanks = listed.flatMap((product) => {
    const areas = product.printDetails.printAreas.filter(
      (area) => area.supportsBackendRendering
    );
    return product.printDetails.supportsBackendRendering && areas.length > 0
      ? [
          {
            baseCost: product.priceFrom ?? undefined,
            id: product.id,
            name: product.name,
            printAreas: areas,
            slug: product.slug,
          },
        ]
      : [];
  });
  if (blanks.length === 0) {
    logEmptyCatalog(
      `"${query}"`,
      `products=${listed.length} shape=${replyShape(reply)}`
    );
  }
  return blanks;
};

const variantsSchema = z.object({
  colors: z.array(z.string().min(1)),
  sizes: z.array(z.string().min(1)),
  slug: z.string().min(1),
});

export interface Variants {
  colors: string[];
  sizes: string[];
}

// A blank's colors and sizes, as Fourthwall spells them (sizes go back
// verbatim).
export const blankVariants = async (
  call: ToolCall,
  slug: string
): Promise<Variants> => {
  const reply = await call("ecommerce_get-catalog-product-details", {
    slugs: [slug],
  });
  const found = findAll(variantsSchema, reply).find(
    (product) => product.slug === slug
  );
  if (found === undefined) {
    throw new Error(`Fourthwall returned no colors or sizes for ${slug}`);
  }
  return { colors: found.colors, sizes: found.sizes };
};

export interface RegionArt {
  // Copy the art onto every spot the area prints (both mug sides).
  fillAll?: boolean | undefined;
  // Size as a fraction of the region (or of the placement): 1 = fits.
  fraction?: number | undefined;
  // Moves the art's centre, -0.5 to 0.5; not with a placement.
  offset?: { x: number; y: number } | undefined;
  placementId?: string | undefined;
  region: string;
  // A media-library URL.
  url: string;
}

export interface ItemPreviewInput {
  colors: string[];
  productId: string;
  regions: RegionArt[];
  sizes: string[];
}

const mockupSchema = z.union([z.url(), z.object({ url: z.url() })]);

const throwBulkErrors = (reply: unknown) => {
  const [failed] = findAll(z.object({ bulkError: z.string().min(1) }), reply);
  if (failed !== undefined) {
    throw new Error(`Fourthwall refused: ${failed.bulkError.slice(0, 200)}`);
  }
};

// The preview arguments for one product: every region with its placement,
// size and offset, and every color and size it is sold in.
export const previewArgs = ({
  colors,
  productId,
  regions,
  sizes,
}: ItemPreviewInput) => {
  const placed = regions.some((art) => art.placementId !== undefined);
  const offsets = regions.flatMap((art, regionIndex) =>
    art.offset === undefined || art.placementId !== undefined
      ? []
      : [{ regionIndex, x: art.offset.x, y: art.offset.y }]
  );
  return {
    colors,
    fillAllPlacements: regions.map((art) => art.fillAll ?? false),
    productId,
    regionFractions: regions.map((art) => art.fraction ?? 1),
    regionNames: regions.map((art) => art.region),
    regionUrls: regions.map((art) => art.url),
    sizes,
    ...(placed
      ? { placementIds: regions.map((art) => art.placementId ?? "") }
      : {}),
    ...(offsets.length > 0 ? { regionOffsets: offsets } : {}),
  };
};

export interface ItemPreview {
  customizationId: string;
  mockups: string[];
}

// Renders every placement of one product in every color: the customization
// it is made from, and its mockups.
export const previewItem = async (
  call: ToolCall,
  input: ItemPreviewInput
): Promise<ItemPreview> => {
  const reply = await call("ecommerce_generate-product-design-previews", {
    products: [previewArgs(input)],
  });
  throwBulkErrors(reply);
  const preview = findOne(
    z.object({
      customizationId: z.string().min(1),
      images: z.array(mockupSchema).default([]),
    }),
    reply,
    "design preview"
  );
  return {
    customizationId: preview.customizationId,
    mockups: preview.images.map((image) =>
      typeof image === "string" ? image : image.url
    ),
  };
};

const COST_KEYS = [
  "totalCost",
  "total",
  "manufacturingCost",
  "cost",
  "price",
] as const;

const sizeCostSchema = z
  .object({ size: z.string().min(1) })
  .catchall(z.unknown())
  .transform((entry, ctx) => {
    for (const key of COST_KEYS) {
      const parsed = money.safeParse(entry[key]);
      if (parsed.success) {
        return { cost: parsed.data, size: entry.size };
      }
    }
    ctx.addIssue({ code: "custom", message: "no cost" });
    return z.NEVER;
  });

// What Fourthwall charges to make the customization, dollars, in its
// costliest size: the blank plus every print area it carries.
export const customizationCost = async (
  call: ToolCall,
  customizationId: string
): Promise<{ bySize: Record<string, number>; max: number }> => {
  const reply = await call("ecommerce_get-customization-pricing", {
    customizationId,
  });
  const bySize: Record<string, number> = {};
  for (const { cost, size } of findAll(sizeCostSchema, reply)) {
    bySize[size] = Math.max(bySize[size] ?? 0, cost);
  }
  const costs = Object.values(bySize).filter((cost) => cost > 0);
  if (costs.length === 0) {
    throw new Error("Fourthwall's pricing reply had no cost per size");
  }
  return { bySize, max: Math.max(...costs) };
};

// The drop's Fourthwall collection; Fourthwall creates it hidden.
export const createCollection = async (
  call: ToolCall,
  {
    description,
    name,
    offerIds,
  }: { description: string; name: string; offerIds: string[] }
) => {
  const reply = await call("ecommerce_create-collection", {
    available: true,
    description,
    name: name.slice(0, 200),
    offerIds,
  });
  return findOne(z.object({ id: z.string().min(1) }), reply, "collection").id;
};

// Makes the collection and its products public.
export const publishCollection = async (
  call: ToolCall,
  collectionId: string
) => {
  const reply = await call("ecommerce_update-collection-state", {
    collectionId,
    shouldUpdateOffersStatus: true,
    state: "PUBLIC",
  });
  return findOne(
    z.object({ slug: z.string().min(1) }),
    reply,
    "published collection"
  ).slug;
};

// Uploads PNG bytes wovain made (rasterized or post-processed art) to the
// shop's media library: a signed URL, a PUT, the confirm, then the library,
// whose CDN URI is what previews accept.
export const uploadPng = async (
  call: ToolCall,
  png: Uint8Array<ArrayBuffer> | Buffer,
  { height, width }: { height: number; width: number },
  fetchFn: typeof fetch = fetch
) => {
  const upload = findOne(
    z.object({ signedUrl: z.url(), uploadId: z.string().min(1) }),
    await call("request-upload-url", {
      contentType: "image/png",
      filename: `wovain-${Date.now()}.png`,
    }),
    "upload URL"
  );
  const put = await fetchFn(upload.signedUrl, {
    body: new Uint8Array(png),
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
  return findOne(
    z.object({ uri: z.url() }),
    await call("ecommerce_save-media-library-image", {
      height,
      uri: confirmed.url,
      width,
    }),
    "media library image"
  ).uri;
};
