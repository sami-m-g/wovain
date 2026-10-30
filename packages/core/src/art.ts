import sharp from "sharp";
import { z } from "zod";

import { MAX_THREAD_COLORS, PRINT_METHODS } from "./drops";
import type { ArtType, PlacedPiece } from "./drops";
import type { FalJobs } from "./fal";
import { findAll } from "./upstream";

// Art per art type (openspec design-drops). fal draws, code finishes:
// - graphic: GPT Image (FAL_IMAGE_MODEL) on a transparent background, at
//   the region's aspect;
// - mark and embroidery: a vector model (Recraft) with the drop's palette;
//   embroidery is snapped to at most 6 colors and rasterized in code;
// - typographic: a vector model that sets type well (Ideogram vector);
// - pattern: a seamless tile (Ideogram tiling), repeated in code over the
//   region;
// - label: no AI, an SVG template with the brand name.
// Raster art without transparency goes through a background remover
// (BiRefNet), and art below the method's DPI through an upscaler. Every
// result is a PNG at the region's exact pixels, with hard alpha edges.
//
// The fal endpoints other than GPT Image come from FAL_ART_MODELS (JSON,
// set from Pulumi config `falArtModels`), so a model changes per
// environment without a code change.

export const artModelsSchema = z.strictObject({
  // Removes a background (BiRefNet).
  cutout: z.string().min(1),
  // Draws a seamless tile (Ideogram tiling).
  pattern: z.string().min(1),
  // Sets type as SVG (Ideogram vector).
  typographic: z.string().min(1),
  // Upscales raster art (Recraft crisp upscale).
  upscale: z.string().min(1),
  // Draws marks as SVG with a palette (Recraft vector).
  vector: z.string().min(1),
});
export type ArtModels = z.infer<typeof artModelsSchema> & {
  // GPT Image: FAL_IMAGE_MODEL.
  graphic: string;
};

export const ART_MODELS_VAR = "FAL_ART_MODELS";

// The models from their JSON. A missing or invalid value throws, naming
// the variable.
export const parseArtModels = (raw?: string) => {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `${ART_MODELS_VAR} is not set: it holds the fal models per art type (apps/web/.env.schema)`
    );
  }
  const parsed = artModelsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${ART_MODELS_VAR} is invalid: ${z.prettifyError(parsed.error)}`
    );
  }
  return parsed.data;
};

// What the drop's brief says to draw; one of each, shared by every product
// so the drop looks like one brand.
export interface DropArt {
  // The statement back print.
  graphicPrompt: string;
  // Every word the graphic prints, spelled exactly.
  graphicText: string[];
  // The brand name on the neck label.
  labelText: string;
  // The small mark: chest, hat, sticker, mug.
  markPrompt: string;
  // 3 to 6 hex colors every piece uses.
  palette: string[];
  // The all-over motif.
  patternPrompt: string;
  // The sleeve's words; empty for none.
  sleeveText: string;
}

const textRule = (text: readonly string[]) =>
  text.length === 0
    ? "No text, letters or numbers anywhere in the art."
    : `The only text in the art, spelled exactly: ${text.map((words) => `"${words}"`).join(", ")}. Print no other text.`;

const HEX = /^#?(?<hex>[\da-f]{6})$/iu;
const BYTE = 255;
// A pixel's RGB as one number: r·65536 + g·256 + b.
const RED = 65_536;
const GREEN = 256;

const rgbOf = (hex: string) => {
  const digits = HEX.exec(hex.trim())?.groups?.hex;
  if (digits === undefined) {
    return;
  }
  const value = Number.parseInt(digits, 16);
  // oxlint-disable-next-line no-bitwise
  return { b: value & BYTE, g: (value >> 8) & BYTE, r: (value >> 16) & BYTE };
};

const paletteRgb = (palette: readonly string[]) =>
  palette.flatMap((hex) => {
    const rgb = rgbOf(hex);
    return rgb === undefined ? [] : [rgb];
  });

// GPT Image on fal: sides a multiple of 16, the longest at most 3840, at
// most 8.29 MP and a ratio of at most 3:1.
const GPT_MAX_SIDE = 3840;
const GPT_MAX_PIXELS = 8_294_400;
const GPT_MAX_RATIO = 3;
const SIDE_STEP = 16;

const toStep = (value: number) =>
  Math.floor(value / SIDE_STEP) * SIDE_STEP || SIDE_STEP;

export const gptImageSize = ({
  height,
  width,
}: {
  height: number;
  width: number;
}) => {
  const ratio = Math.min(
    Math.max(width / height, 1 / GPT_MAX_RATIO),
    GPT_MAX_RATIO
  );
  let h = Math.sqrt(GPT_MAX_PIXELS / ratio);
  let w = h * ratio;
  const over = Math.max(w, h) / GPT_MAX_SIDE;
  if (over > 1) {
    w /= over;
    h /= over;
  }
  return { height: toStep(h), width: toStep(w) };
};

const IDEOGRAM_RATIOS = [
  "1:4",
  "1:3",
  "1:2",
  "9:16",
  "2:3",
  "3:4",
  "4:5",
  "1:1",
  "5:4",
  "4:3",
  "3:2",
  "16:9",
  "2:1",
  "3:1",
  "4:1",
] as const;

// The supported aspect ratio closest to the region's.
export const nearestRatio = ({
  height,
  width,
}: {
  height: number;
  width: number;
}) => {
  const target = Math.log(width / height);
  let best: (typeof IDEOGRAM_RATIOS)[number] = "1:1";
  let gap = Number.POSITIVE_INFINITY;
  for (const ratio of IDEOGRAM_RATIOS) {
    const [w = 1, h = 1] = ratio.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < gap) {
      gap = distance;
      best = ratio;
    }
  }
  return best;
};

// Vector art's longest side, in the region's aspect: Recraft takes any
// size, and the SVG scales to the print anyway.
const VECTOR_SIDE = 1024;

export const vectorSize = ({
  height,
  width,
}: {
  height: number;
  width: number;
}) => {
  const scale = VECTOR_SIDE / Math.max(width, height);
  return {
    height: toStep(height * scale),
    width: toStep(width * scale),
  };
};

// Which drawn art a piece uses: one per art type per drop, so every
// product carries the same art. Embroidery is drawn per aspect ratio (a
// wide hat front, a square chest), with the embroidery prompt.
export const artSourceKey = (
  artType: ArtType,
  pixels: { height: number; width: number }
) =>
  artType === "embroidery"
    ? `embroidery:${nearestRatio(pixels).replace(":", "x")}`
    : artType;

const ORIGINAL =
  "Original art only: never name or imitate a brand, artist, character or title.";

export interface ArtRequest {
  input: Record<string, unknown>;
  model: string;
  // What fal returns: an SVG to rasterize, or a raster image.
  output: "svg" | "raster";
}

// The fal job that draws a piece; undefined for labels, which code draws.
export const artRequest = (
  artType: ArtType,
  art: DropArt,
  models: ArtModels,
  pixels: { height: number; width: number }
): ArtRequest | undefined => {
  const colors = paletteRgb(art.palette);
  switch (artType) {
    case "graphic": {
      return {
        input: {
          background: "transparent",
          image_size: gptImageSize(pixels),
          num_images: 1,
          output_format: "png",
          prompt: `${art.graphicPrompt}\n\n${textRule(art.graphicText)}\n\nColors: ${art.palette.join(", ")}. ${ORIGINAL} Print-ready apparel artwork only: no garment, no mockup, no background, no frame, nothing cropped at the edges.`,
          quality: "high",
        },
        model: models.graphic,
        output: "raster",
      };
    }
    case "mark": {
      return {
        input: {
          colors,
          image_size: { height: VECTOR_SIDE, width: VECTOR_SIDE },
          prompt: `${art.markPrompt}. A small, bold logo mark that reads at 3 inches, centered, on nothing. Flat solid colors, no gradients. ${ORIGINAL}`,
        },
        model: models.vector,
        output: "svg",
      };
    }
    case "embroidery": {
      return {
        input: {
          colors: colors.slice(0, MAX_THREAD_COLORS),
          image_size: vectorSize(pixels),
          prompt: `${art.markPrompt}. A bold logo mark for embroidery, centered, filling the frame's shape, on nothing. Flat embroidery-ready shapes: thick strokes, no gradients, no shading, no thin lines, no fine detail, no small text, at most ${MAX_THREAD_COLORS} solid colors. ${ORIGINAL}`,
        },
        model: models.vector,
        output: "svg",
      };
    }
    case "typographic": {
      return {
        input: {
          aspect_ratio: nearestRatio(pixels),
          num_images: 1,
          prompt: `Typographic print, the words "${art.sleeveText}" only, spelled exactly, bold condensed letters in ${art.palette.slice(0, 2).join(" and ")}, no other text, no background, no decoration.`,
          quality: "medium",
        },
        model: models.typographic,
        output: "svg",
      };
    }
    case "pattern": {
      return {
        input: {
          image_size: "square_hd",
          num_images: 1,
          output_format: "png",
          prompt: `Seamless repeating pattern: ${art.patternPrompt}. Palette ${art.palette.join(", ")}. Flat print design, even spacing, no text. ${ORIGINAL}`,
          tiling_mode: "both",
        },
        model: models.pattern,
        output: "raster",
      };
    }
    case "label": {
      return undefined;
    }
    default: {
      throw new Error(`No art request for ${String(artType)}`);
    }
  }
};

// The image a fal job returned: images[0] or image.
export const outputUrl = (reply: unknown) => {
  const [found] = findAll(
    z.object({ url: z.url({ protocol: /^https$/u }) }),
    reply
  );
  if (found === undefined) {
    throw new Error("fal returned no image");
  }
  return found.url;
};

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const LABEL_MAX = 24;

// The neck label: the brand name over "made to order", in the palette's
// first color. No AI.
export const labelSvg = (text: string, palette: readonly string[]) => {
  const color = palette[0] ?? "#111111";
  const name = escapeXml(text.slice(0, LABEL_MAX).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><text x="300" y="290" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="72" fill="${color}">${name}</text><text x="300" y="370" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="36" fill="${color}">MADE TO ORDER</text></svg>`;
};

const ALPHA_CUT = 128;
const CHANNELS = 4;

// Hard alpha edges: Fourthwall's printers fail on semi-transparent pixels.
const hardenAlpha = async (png: Buffer) => {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += CHANNELS) {
    data[index] = (data[index] ?? 0) >= ALPHA_CUT ? BYTE : 0;
  }
  return await sharp(data, {
    raw: { channels: CHANNELS, height: info.height, width: info.width },
  })
    .png()
    .toBuffer();
};

const colorDistance = (
  a: { b: number; g: number; r: number },
  b: { b: number; g: number; r: number }
) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;

// Every opaque pixel set to its nearest palette color, so the PNG has at
// most as many colors as the palette. Runs on the raster, after the alpha
// is hard, because rasterizing blends colors where two fills meet, and it
// catches any color syntax the SVG used (hex, rgb(), names).
export const snapToPalette = async (
  png: Buffer,
  palette: readonly string[]
) => {
  const targets = paletteRgb(palette);
  const [first] = targets;
  if (first === undefined) {
    return png;
  }
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const nearestOf = new Map<number, { b: number; g: number; r: number }>();
  for (let at = 0; at < data.length; at += CHANNELS) {
    if ((data[at + 3] ?? 0) >= ALPHA_CUT) {
      const rgb = {
        b: data[at + 2] ?? 0,
        g: data[at + 1] ?? 0,
        r: data[at] ?? 0,
      };
      const packed = rgb.r * RED + rgb.g * GREEN + rgb.b;
      let nearest = nearestOf.get(packed);
      if (nearest === undefined) {
        nearest = first;
        for (const candidate of targets) {
          if (colorDistance(candidate, rgb) < colorDistance(nearest, rgb)) {
            nearest = candidate;
          }
        }
        nearestOf.set(packed, nearest);
      }
      data[at] = nearest.r;
      data[at + 1] = nearest.g;
      data[at + 2] = nearest.b;
    }
  }
  return await sharp(data, {
    raw: { channels: CHANNELS, height: info.height, width: info.width },
  })
    .png()
    .toBuffer();
};

const SVG_DPI = 72;
const MAX_DENSITY = 2400;

const transparent = { alpha: 0, b: 0, g: 0, r: 0 };

// The SVG at the region's pixels, centred, with room around it.
export const rasterizeSvg = async (
  svg: string,
  { height, width }: { height: number; width: number }
) => {
  const source = Buffer.from(svg);
  const meta = await sharp(source).metadata();
  const scale = Math.max(
    width / (meta.width || 1),
    height / (meta.height || 1)
  );
  const density = Math.min(Math.ceil(SVG_DPI * scale), MAX_DENSITY);
  const png = await sharp(source, { density })
    .resize(width, height, { background: transparent, fit: "contain" })
    .png()
    .toBuffer();
  return await hardenAlpha(png);
};

const TILES_ACROSS = 4;

// A tile repeated over the region: TILES_ACROSS repeats across.
export const tilePattern = async (
  tile: Buffer,
  { height, width }: { height: number; width: number }
) => {
  const size = Math.ceil(width / TILES_ACROSS);
  const resized = await sharp(tile).resize(size, size).png().toBuffer();
  return await sharp({
    create: { background: transparent, channels: CHANNELS, height, width },
  })
    .composite([{ input: resized, tile: true }])
    .png()
    .toBuffer();
};

// Raster art at the region's pixels, centred, hard-edged.
export const fitRaster = async (
  image: Buffer,
  { height, width }: { height: number; width: number },
  { opaque }: { opaque: boolean }
) => {
  const png = await sharp(image)
    .resize(width, height, { background: transparent, fit: "contain" })
    .png()
    .toBuffer();
  return opaque ? png : await hardenAlpha(png);
};

const SAMPLE_SIDE = 512;
const MAX_COUNTED_COLORS = 4096;

export interface Inspection {
  // Distinct opaque colors (counted up to 4096).
  colors: number;
  hasAlpha: boolean;
  height: number;
  // Opaque pixels in the art's bounding box, 0 to 1: near 1 means a solid
  // rectangle (a square image on a shirt).
  fill: number;
  // Share of opaque pixels: near 0 means nothing prints (a label whose
  // font is missing, an empty cutout).
  opaqueShare: number;
  // Share of fully transparent pixels.
  transparentShare: number;
  width: number;
}

// Facts code reads from a PNG: size, transparency, how solid the art is and
// how many colors it has.
export const inspectPng = async (png: Buffer): Promise<Inspection> => {
  const meta = await sharp(png).metadata();
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .resize(SAMPLE_SIDE, SAMPLE_SIDE, { fit: "inside", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  let clear = 0;
  const colors = new Set<number>();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const at = (y * info.width + x) * CHANNELS;
      const alpha = data[at + 3] ?? 0;
      if (alpha === 0) {
        clear += 1;
      }
      if (alpha >= ALPHA_CUT) {
        opaque += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (colors.size < MAX_COUNTED_COLORS) {
          colors.add(
            (data[at] ?? 0) * RED +
              (data[at + 1] ?? 0) * GREEN +
              (data[at + 2] ?? 0)
          );
        }
      }
    }
  }
  const box = maxX < 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
  return {
    colors: colors.size,
    fill: box === 0 ? 0 : opaque / box,
    hasAlpha: meta.hasAlpha === true,
    height: meta.height ?? info.height,
    opaqueShare: opaque / (info.width * info.height),
    transparentShare: clear / (info.width * info.height),
    width: meta.width ?? info.width,
  };
};

// The checks code decides for a placed piece; final, like the design
// judge's print facts.
export const PIECE_RULES = [
  "has_art",
  "print_dpi",
  "aspect_fit",
  "transparency",
  "slab",
  "thread_colors",
] as const;
export type PieceRule = (typeof PIECE_RULES)[number];

// A note before the verdict, as in the design judge.
export interface PieceCheck {
  note: string;
  pass: boolean;
  rule: PieceRule;
}

// Art that covers less of its canvas than this prints next to nothing.
const MIN_OPAQUE = 0.005;
// Art whose box is this full is a rectangle, not a print.
const SLAB_FILL = 0.9;
// The source may be this much smaller than the print and still pass.
const DPI_SLACK = 0.9;
// Art this much wider or taller than its region wastes the print area.
const ASPECT_SLACK = 1.35;

export interface Source {
  height: number;
  // Vector art scales to any size.
  vector: boolean;
  width: number;
}

export const pieceFacts = (
  piece: Pick<PlacedPiece, "artType" | "method" | "pixels" | "printInches">,
  source: Source,
  final: Inspection
): PieceCheck[] => {
  const needed = PRINT_METHODS[piece.method].dpi;
  const dpi = Math.floor(
    Math.min(
      source.width / piece.printInches.w,
      source.height / piece.printInches.h
    )
  );
  const sharpEnough = source.vector || dpi >= needed * DPI_SLACK;
  const regionRatio = piece.pixels.width / piece.pixels.height;
  const sourceRatio = source.width / source.height;
  const stretch = Math.max(
    regionRatio / sourceRatio,
    sourceRatio / regionRatio
  );
  const checks: PieceCheck[] = [
    {
      note: `${(final.opaqueShare * 100).toFixed(1)}% of the canvas prints.`,
      pass: final.opaqueShare >= MIN_OPAQUE,
      rule: "has_art",
    },
    {
      note: source.vector
        ? "Vector art, rasterized at print size."
        : `${dpi} DPI at ${piece.printInches.w}×${piece.printInches.h} in; ${needed} needed.`,
      pass: sharpEnough,
      rule: "print_dpi",
    },
    {
      note: `Art ${source.width}×${source.height}, region ${piece.pixels.width}×${piece.pixels.height}.`,
      pass: stretch <= ASPECT_SLACK || piece.artType === "label",
      rule: "aspect_fit",
    },
  ];
  if (piece.artType !== "pattern") {
    checks.push(
      {
        note: `${Math.round(final.transparentShare * 100)}% transparent.`,
        pass: final.hasAlpha && final.transparentShare > 0,
        rule: "transparency",
      },
      {
        note: `The art fills ${Math.round(final.fill * 100)}% of its box.`,
        pass: final.fill <= SLAB_FILL,
        rule: "slab",
      }
    );
  }
  if (piece.artType === "embroidery") {
    checks.push({
      note: `${final.colors} thread colors; at most ${MAX_THREAD_COLORS}.`,
      pass: final.colors <= MAX_THREAD_COLORS,
      rule: "thread_colors",
    });
  }
  return checks;
};

export interface FinishedArt {
  facts: PieceCheck[];
  height: number;
  png: Buffer;
  // The art fal drew (or the label), before it was fitted.
  sourceUrl?: string | undefined;
  width: number;
}

export interface FinishInput {
  art: DropArt;
  // Downloads fal's output.
  fetchFn?: typeof fetch | undefined;
  jobs: FalJobs;
  models: ArtModels;
  piece: Pick<PlacedPiece, "artType" | "method" | "pixels" | "printInches">;
  // The URL fal returned for the piece's request; none for labels.
  sourceUrl?: string | undefined;
}

const download = async (url: string, fetchFn: typeof fetch) => {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Couldn't download the art (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

// A raster fal step on an image URL (cutout, upscale): its output URL.
const rasterStep = async (jobs: FalJobs, model: string, imageUrl: string) => {
  const requestId = await jobs.submit(model, { image_url: imageUrl });
  return outputUrl(await jobs.result(model, requestId));
};

// fal's raw art to the PNG Fourthwall prints, with the facts code reads
// from it. Raster art without alpha goes through the background remover,
// and raster art below the method's DPI through the upscaler, once each.
export const finishArt = async ({
  art,
  fetchFn = fetch,
  jobs,
  models,
  piece,
  sourceUrl,
}: FinishInput): Promise<FinishedArt> => {
  const { pixels } = piece;
  // Embroidery stitches at most MAX_THREAD_COLORS palette colors.
  const threads = async (png: Buffer) =>
    piece.artType === "embroidery"
      ? await snapToPalette(png, art.palette.slice(0, MAX_THREAD_COLORS))
      : png;
  if (piece.artType === "label" || sourceUrl === undefined) {
    const png = await rasterizeSvg(
      labelSvg(art.labelText, art.palette),
      pixels
    );
    const source = { height: pixels.height, vector: true, width: pixels.width };
    return {
      facts: pieceFacts(piece, source, await inspectPng(png)),
      height: pixels.height,
      png,
      width: pixels.width,
    };
  }
  const raw = await download(sourceUrl, fetchFn);
  const isSvg = raw.subarray(0, 512).toString("utf-8").includes("<svg");
  if (isSvg) {
    const png = await threads(
      await rasterizeSvg(raw.toString("utf-8"), pixels)
    );
    const source = { height: pixels.height, vector: true, width: pixels.width };
    return {
      facts: pieceFacts(piece, source, await inspectPng(png)),
      height: pixels.height,
      png,
      sourceUrl,
      width: pixels.width,
    };
  }
  let url = sourceUrl;
  let image = raw;
  let meta = await sharp(image).metadata();
  const pattern = piece.artType === "pattern";
  if (!pattern && meta.hasAlpha !== true) {
    url = await rasterStep(jobs, models.cutout, url);
    image = await download(url, fetchFn);
    meta = await sharp(image).metadata();
  }
  // A tile repeats, so it needs the DPI of one repeat, not of the region.
  const neededWidth = pattern
    ? Math.ceil(pixels.width / TILES_ACROSS)
    : pixels.width;
  if ((meta.width ?? 0) < neededWidth * DPI_SLACK) {
    url = await rasterStep(jobs, models.upscale, url);
    image = await download(url, fetchFn);
    meta = await sharp(image).metadata();
  }
  const png = pattern
    ? await tilePattern(image, pixels)
    : await threads(await fitRaster(image, pixels, { opaque: false }));
  const scale = pattern ? TILES_ACROSS : 1;
  const source = {
    height: (meta.height ?? 0) * scale,
    vector: false,
    width: (meta.width ?? 0) * scale,
  };
  return {
    facts: pieceFacts(piece, source, await inspectPng(png)),
    height: pixels.height,
    png,
    sourceUrl: url,
    width: pixels.width,
  };
};
