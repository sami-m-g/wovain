import sharp from "sharp";
import { z } from "zod";

// Reads the format, size and transparency of what ChatGPT and fal return
// (PNG, JPEG, WebP) from the image header. Every other loader is blocked, so
// libvips never parses an SVG, TIFF or other untrusted format.
sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({
  operation: [
    "VipsForeignLoadPngBuffer",
    "VipsForeignLoadJpegBuffer",
    "VipsForeignLoadWebpBuffer",
  ],
});

const formatSchema = z.enum(["png", "jpeg", "webp"]);

export interface ImageInfo {
  format: z.infer<typeof formatSchema>;
  height: number;
  transparent: boolean;
  width: number;
}

// Anything sharp can't read, or reads as another format, is undefined.
export const readImageInfo = async (
  bytes: Uint8Array
): Promise<ImageInfo | undefined> => {
  try {
    const meta = await sharp(bytes).metadata();
    return {
      format: formatSchema.parse(meta.format),
      height: meta.height,
      transparent: meta.hasAlpha,
      width: meta.width,
    };
  } catch {
    return undefined;
  }
};
