import { createHash } from "node:crypto";

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  designResultSchema,
  designSchema,
  MAX_RANGE,
  quoteResultSchema,
  rangeProductSchema,
} from "@wovain/shared/design";
import type { Design, DesignQuote } from "@wovain/shared/design";
import { priceProduct, sizeCostSchema } from "@wovain/shared/economics";
import type { SizeCost } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";
import { z } from "zod";

import { rejectDesign } from "../lib/approval.ts";
import { uploadArtwork } from "../lib/fetch-image.ts";
import { readImageInfo } from "../lib/image.ts";
import { loadArtwork } from "../lib/load-artwork.ts";
import { text } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

// ChatGPT passes a generated or uploaded image as a file object
// (developers.openai.com/plugins/build/chatgpt-ui, "openai/fileParams").
const fileParamSchema = z.object({
  download_url: z.url(),
  file_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
});

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const toDesignQuote = (
  quote: ReturnType<typeof priceProduct>
): DesignQuote => ({
  baseCost: quote.baseCost,
  breakevenPerSale: quote.breakeven.perSale,
  cardFees: quote.breakeven.cardFees,
  marginPct: quote.marginPct,
  price: quote.price,
  profit: quote.profit,
  refundReserve: quote.breakeven.refundReserve,
  roas: quote.breakeven.roas,
});

// The offered sizes set the price; with none in stock, every size does.
const quoteFor = (
  sizes: (SizeCost & { inStock: boolean })[],
  settings: Settings
) => {
  const offered = sizes.filter((size) => size.inStock);
  return toDesignQuote(
    priceProduct(
      offered.length > 0 ? offered : sizes,
      settings.pricing,
      settings.economics
    )
  );
};

// What the agent sends for a design: wovain prices every product itself and
// keeps the publish state.
const designInputSchema = designSchema
  .omit({
    // Only the confirm page approves (lib/approval.ts).
    approval: true,
    collectionId: true,
    // Set by wovain only: autopilot publishes hidden, and a design belongs
    // to the run it was made in (store.saveDesign).
    hidden: true,
    productId: true,
    productUrl: true,
    quote: true,
    range: true,
    rejectCount: true,
    rejectReason: true,
    run: true,
    status: true,
  })
  .partial({ id: true })
  .extend({
    range: z
      .array(
        rangeProductSchema.omit({
          offerId: true,
          productUrl: true,
          quote: true,
        })
      )
      .max(MAX_RANGE)
      .default([]),
  });

type DesignInput = z.output<typeof designInputSchema>;

const idsOf = (items: { customizationId: string }[]) =>
  items
    .map((item) => item.customizationId)
    .toSorted()
    .join(",");

// The design to save: every product priced, and a product already created
// on an earlier try keeps its offer.
const pricedDesign = (
  input: DesignInput,
  settings: Settings,
  stored?: Design
) => {
  const offerOf = (customizationId: string) =>
    stored?.range.find((item) => item.customizationId === customizationId)
      ?.offerId;
  const range = input.range.map((product) => {
    const offerId = offerOf(product.customizationId);
    return {
      ...product,
      quote: quoteFor(product.sizes, settings),
      ...(offerId === undefined ? {} : { offerId }),
    };
  });
  // The hero's offer belongs to its customization, and the collection to
  // the drop's exact products: a redraw that changes them starts afresh.
  const kept =
    stored?.customizationId === input.customizationId ? stored : undefined;
  const sameDrop =
    kept !== undefined && idsOf(kept.range) === idsOf(input.range);
  return {
    ...input,
    ...(kept?.productId === undefined ? {} : { productId: kept.productId }),
    ...(sameDrop && kept.collectionId !== undefined
      ? { collectionId: kept.collectionId }
      : {}),
    // A redraw stays in the run it was made in, and hidden stays hidden.
    ...(stored?.hidden === undefined ? {} : { hidden: stored.hidden }),
    quote: quoteFor(input.sizes, settings),
    range,
    rejectCount: stored?.rejectCount ?? 0,
    ...(stored?.run === undefined ? {} : { run: stored.run }),
    status: "draft" as const,
  };
};

// Saves a design the agent shows: a new one, or a redraw that replaces the
// stored design whole in one transaction (approval, links and the rejection
// reason go; offers that still match stay).
const saveShown = async (store: Store, input: DesignInput) => {
  const settings = await store.getSettings();
  if (input.id === undefined) {
    return await store.saveDesign(pricedDesign(input, settings));
  }
  return await store.replaceDesign(input.id, (stored) => {
    if (stored.approval?.claimedAt !== undefined) {
      throw new Error(
        `Design ${stored.id} is being published; redraw it after.`
      );
    }
    return pricedDesign(input, settings, stored);
  });
};

const artworkOutput = z.object({
  artworkId: z.string(),
  bytes: z.int(),
  contentType: z.string(),
  fileName: z.string(),
  height: z.int(),
  transparent: z.boolean(),
  url: z.url().optional(),
  width: z.int(),
});

export const registerDesignTools = (server: McpServer, store: Store) => {
  server.registerTool(
    "stage_artwork",
    {
      _meta: { "openai/fileParams": ["artwork"] },
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Stage design artwork and measure it. Pass exactly one: `url` for image generation's result (a data:image/... URL) or a public https image (fal's result, a Fourthwall CDN image), or `artwork` for a file the merchant attached (a ChatGPT file object). Returns pixel size, transparency and byte size, which request-media-upload-link and the design widget need.",
      inputSchema: z.object({
        artwork: fileParamSchema.optional(),
        url: z.string().optional(),
      }),
      outputSchema: artworkOutput,
      title: "Stage artwork",
    },
    async ({ artwork, url }) => {
      const { bytes, source } = await loadArtwork({
        fileUrl: artwork?.download_url,
        url,
      });
      const info = await readImageInfo(bytes);
      if (info === undefined) {
        throw new Error("the image isn't a PNG, JPEG or WebP");
      }
      const contentType = `image/${info.format}` as const;
      const hash = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 16);
      const fileName = `wovain-${hash}.${extensions[contentType]}`;
      const saved = await store.saveArtwork(
        {
          bytes: bytes.byteLength,
          contentType,
          height: info.height,
          ...(source === undefined ? {} : { sourceUrl: source }),
          transparent: info.transparent,
          width: info.width,
        },
        bytes,
        fileName
      );
      const result = {
        artworkId: saved.id,
        bytes: saved.bytes,
        contentType,
        fileName,
        height: saved.height,
        transparent: saved.transparent,
        ...(source === undefined ? {} : { url: source }),
        width: saved.width,
      };
      return {
        content: text(JSON.stringify(result)),
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    "put_artwork",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Upload staged artwork to the signed uploadUrl from Fourthwall's request-media-upload-link (call it with the fileName, contentType and bytes from stage_artwork). Then call save-media-library-image with the link's fileUrl and the artwork's width and height.",
      inputSchema: z.object({ artworkId: z.string(), uploadUrl: z.url() }),
      outputSchema: z.object({ bytes: z.int(), uploaded: z.boolean() }),
      title: "Upload artwork to Fourthwall",
    },
    async ({ artworkId, uploadUrl }) => {
      const artwork = await store.getArtwork(artworkId);
      if (artwork === undefined) {
        throw new Error(`no staged artwork ${artworkId}`);
      }
      await uploadArtwork(
        uploadUrl,
        await store.readArtworkBytes(artwork),
        artwork.contentType
      );
      const result = { bytes: artwork.bytes, uploaded: true };
      return { content: text("Uploaded."), structuredContent: result };
    }
  );

  server.registerTool(
    "price_product",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Price a product with wovain's rule (at least the minimum profit or margin, rounded up to a clean price that keeps the minimum profit per sale after fees) and return the breakeven math. Pass every offered size with its base cost from get-customization-pricing. Pass the live shipping rate when known.",
      inputSchema: z.object({
        shipping: z.number().min(0).optional(),
        sizes: z.array(sizeCostSchema).min(1),
      }),
      outputSchema: quoteResultSchema,
      title: "Price a product",
    },
    async ({ shipping, sizes }) => {
      const settings = await store.getSettings();
      const economics =
        shipping === undefined
          ? settings.economics
          : { ...settings.economics, shipping };
      const quote = toDesignQuote(
        priceProduct(sizes, settings.pricing, economics)
      );
      return {
        content: text(JSON.stringify(quote)),
        structuredContent: { quote },
      };
    }
  );

  registerAppTool(
    server,
    "show_design_widget",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Design ready",
        "openai/toolInvocation/invoking": "Laying out the design widget…",
        ui: { resourceUri: widgetUri("design") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show one design widget for an idea: the hero product on its Fourthwall blank (mockups, colors, placement and extraPlacements, file quality, sizes, listing) and the rest of the drop in `range` (up to 7 more products, each with kind, blank, placements, colors, mockups, sizes with cost and listing). wovain prices every product from its sizes' costs. Omit id for a new design; pass the id to redraw after feedback. Publishing happens only after the merchant approves on the widget.",
      inputSchema: designInputSchema,
      outputSchema: designResultSchema,
      title: "Show design widget",
    },
    async (input) => {
      const design = await saveShown(store, input);
      return {
        content: text(
          `Showing design ${design.id}. Wait for the merchant to approve, skip or give feedback on the widget.`
        ),
        structuredContent: { design },
      };
    }
  );

  registerAppTool(
    server,
    "record_design",
    {
      _meta: {
        ui: { resourceUri: widgetUri("design"), visibility: ["model", "app"] },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Record a design as skipped (the merchant skipped it) or rejected (Fourthwall refused it outside publish_design, with the reason). The design widget updates itself from this. Approving and publishing happen only through the widget and publish_design.",
      inputSchema: z.object({
        id: z.string(),
        rejectReason: z.string().min(1).optional(),
        status: z.enum(["rejected", "skipped"]),
      }),
      outputSchema: designResultSchema,
      title: "Record design state",
    },
    async ({ id, rejectReason, status }) => {
      const design =
        status === "rejected"
          ? await rejectDesign(store, id, {
              counted: true,
              reason: rejectReason ?? "No reason given",
            })
          : await store.updateDesign(id, { status });
      return {
        content: text(`Design ${id} is ${status}.`),
        structuredContent: { design },
      };
    }
  );

  registerAppTool(
    server,
    "get_design",
    {
      _meta: { ui: { resourceUri: widgetUri("design"), visibility: ["app"] } },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Read a design's current state (used by the design widget to follow publishing).",
      inputSchema: z.object({ id: z.string() }),
      outputSchema: designResultSchema,
      title: "Get design",
    },
    async ({ id }) => {
      const design = await store.requireDesign(id);
      return { content: text(design.status), structuredContent: { design } };
    }
  );
};
