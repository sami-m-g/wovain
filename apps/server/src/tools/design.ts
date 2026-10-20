import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  designResultSchema,
  designSchema,
  quoteResultSchema,
  designStatusSchema,
} from "@wovain-foss/shared/design";
import type { Design, DesignQuote } from "@wovain-foss/shared/design";
import { priceProduct, sizeCostSchema } from "@wovain-foss/shared/economics";
import { z } from "zod";

import { cardUri } from "../cards.ts";
import { assertUploadUrl } from "../lib/fetch-image.ts";
import { readImageInfo } from "../lib/image.ts";
import { loadArtwork } from "../lib/load-artwork.ts";
import { text } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";

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
        "Stage design artwork and measure it. Pass exactly one: `url` for image generation's result (a data:image/... URL) or a public https image (fal's result, a Fourthwall CDN image), or `artwork` for a file the merchant attached (a ChatGPT file object). Returns pixel size, transparency and byte size, which request-media-upload-link and the design card need.",
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
      const info = readImageInfo(bytes);
      if (info === undefined) {
        throw new Error("the image isn't a PNG, JPEG or WebP");
      }
      const contentType = `image/${info.format}` as const;
      const hash = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 16);
      const fileName = `wovain-${hash}.${extensions[contentType]}`;
      await mkdir(store.mediaDir, { recursive: true });
      const file = path.join(store.mediaDir, fileName);
      await writeFile(file, bytes);
      const saved = await store.saveArtwork({
        bytes: bytes.byteLength,
        contentType,
        file,
        height: info.height,
        ...(source === undefined ? {} : { sourceUrl: source }),
        transparent: info.transparent,
        width: info.width,
      });
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
      const response = await fetch(await assertUploadUrl(uploadUrl), {
        body: await readFile(artwork.file),
        // Fourthwall signs the upload with its content type and a size
        // limit; both headers must match or Google storage answers 403.
        headers: {
          "content-type": artwork.contentType,
          "x-goog-content-length-range": `0,${artwork.bytes}`,
        },
        method: "PUT",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`Fourthwall storage answered ${response.status}`);
      }
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
    "show_design_card",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Design ready",
        "openai/toolInvocation/invoking": "Laying out the design card…",
        ui: { resourceUri: cardUri("design") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show one design card: the design on a Fourthwall blank with mockups, colors, placement, file quality, sizes, listing and the price from price_product. Omit id for a new design; pass the id to redraw a design after feedback. Publishing happens only after the merchant approves on the card.",
      inputSchema: designSchema.omit({ status: true }).partial({ id: true }),
      outputSchema: designResultSchema,
      title: "Show design card",
    },
    async (input) => {
      const design = await store.saveDesign({ ...input, status: "draft" });
      return {
        content: text(
          `Showing design ${design.id}. Wait for the merchant to approve, skip or give feedback on the card.`
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
        ui: { resourceUri: cardUri("design"), visibility: ["model", "app"] },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Record a design's state: publishing when you start the Fourthwall publish, live with productId and productUrl once it is public, rejected with the reason if Fourthwall refuses, skipped when the merchant skips. The design card updates itself from this.",
      inputSchema: z.object({
        id: z.string(),
        productId: z.string().optional(),
        productUrl: z.url().optional(),
        rejectReason: z.string().optional(),
        status: designStatusSchema,
      }),
      outputSchema: designResultSchema,
      title: "Record design state",
    },
    async ({ id, productId, productUrl, rejectReason, status }) => {
      const current = await store.requireDesign(id);
      const patch: Partial<Design> = { status };
      if (productId !== undefined) {
        patch.productId = productId;
      }
      if (productUrl !== undefined) {
        patch.productUrl = productUrl;
      }
      if (status === "rejected") {
        patch.rejectCount = current.rejectCount + 1;
        patch.rejectReason = rejectReason ?? "No reason given";
      }
      const design = await store.updateDesign(id, patch);
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
      _meta: { ui: { resourceUri: cardUri("design"), visibility: ["app"] } },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Read a design's current state (used by the design card to follow publishing).",
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
