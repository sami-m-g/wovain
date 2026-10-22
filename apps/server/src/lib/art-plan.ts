import { z } from "zod";

// Print art on fal: GPT Image 2.5 draws on a transparent background, and its
// edit route takes earlier art as a reference so a drop's pieces match.
const TEXT_TO_IMAGE = "openai/gpt-image-2.5/flare/text-to-image";
const EDIT = "openai/gpt-image-2.5/flare/edit";

// Sizes within the model's limits (3840 px a side, 8.29 MP, multiples of 16):
// square 2880 px prints 19.2 in at 150 DPI; portrait for tall back prints;
// wide for mug wraps and sleeve wordmarks.
const sizes = {
  portrait: { height: 3200, width: 2400 },
  square: { height: 2880, width: 2880 },
  wide: { height: 1920, width: 3840 },
} as const;

// What one piece costs at fal's list price for GPT Image 2.5 high at these
// sizes (about $0.055 at 2560×1440 and $0.10 at 3840×2160): the high end,
// so autopilot's cap counts it before the job is sent (an estimate).
export const ART_USD_PER_PIECE = 0.1;

const httpsUrl = z.url({ protocol: /^https$/u });

export const artPieceSchema = z.object({
  // What the piece is for, e.g. "hero front", "back print", "sleeve mark".
  name: z.string().min(1).max(60),
  prompt: z.string().min(10).max(4000),
  // Earlier art of the drop to match (fal or Fourthwall URLs).
  referenceUrls: z.array(httpsUrl).max(4).optional(),
  shape: z.enum(["square", "portrait", "wide"]).default("square"),
  // Every word the piece prints, exactly as it should read ("NEKO CLUB");
  // [] for none. When set, the model is told to print nothing else. An
  // autopilot run requires it on every piece (lib/autopilot.ts).
  text: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
});
export type ArtPiece = z.infer<typeof artPieceSchema>;

// OCR on fal (Florence-2 Large): reads the words an image actually prints,
// so autopilot checks them against what the piece declared. fal lists it at
// $0.00125 per compute second (p90 about 1.7 s); counted as $0.01 an image.
export const OCR_ENDPOINT = "fal-ai/florence-2-large/ocr";
export const OCR_USD = 0.01;

const textRule = (text: string[] | undefined) => {
  if (text === undefined) {
    return "";
  }
  return text.length === 0
    ? "\n\nNo text, letters or numbers anywhere in the art."
    : `\n\nThe only text in the art, spelled exactly: ${text.map((words) => `"${words}"`).join(", ")}. Print no other text.`;
};

// One fal request for a piece: the art alone, transparent, ready to print.
export const artRequest = (piece: ArtPiece) => {
  const references = piece.referenceUrls ?? [];
  return {
    endpoint_id: references.length > 0 ? EDIT : TEXT_TO_IMAGE,
    input: {
      background: "transparent",
      image_size: sizes[piece.shape],
      num_images: 1,
      output_format: "png",
      prompt: `${piece.prompt}${textRule(piece.text)}\n\nPrint-ready artwork for ${piece.name} only: no garment, no mockup, no background, nothing cropped at the edges.`,
      quality: "high",
      ...(references.length > 0 ? { image_urls: references } : {}),
    },
  };
};
