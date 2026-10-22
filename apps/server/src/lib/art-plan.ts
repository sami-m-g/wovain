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

const httpsUrl = z.url({ protocol: /^https$/u });

export const artPieceSchema = z.object({
  // What the piece is for, e.g. "hero front", "back print", "sleeve mark".
  name: z.string().min(1).max(60),
  prompt: z.string().min(10).max(4000),
  // Earlier art of the drop to match (fal or Fourthwall URLs).
  referenceUrls: z.array(httpsUrl).max(4).optional(),
  shape: z.enum(["square", "portrait", "wide"]).default("square"),
});
export type ArtPiece = z.infer<typeof artPieceSchema>;

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
      prompt: `${piece.prompt}\n\nPrint-ready artwork for ${piece.name} only: no garment, no mockup, no background, nothing cropped at the edges.`,
      quality: "high",
      ...(references.length > 0 ? { image_urls: references } : {}),
    },
  };
};
