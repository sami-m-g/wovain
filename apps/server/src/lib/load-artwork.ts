import { downloadImage, MAX_IMAGE_BYTES } from "./fetch-image.ts";

const DATA_URL =
  /^data:image\/(?:png|jpeg|webp);base64,(?<base64>[A-Za-z0-9+/=\s]+)$/u;

// ChatGPT's image generation returns a data: URL, not a file object.
const decodeDataUrl = (url: string) => {
  const base64 = DATA_URL.exec(url)?.groups?.["base64"];
  if (base64 === undefined) {
    throw new Error("only PNG, JPEG or WebP data URLs are accepted");
  }
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is larger than 50 MB");
  }
  return bytes;
};

export interface ArtworkSource {
  fileUrl?: string | undefined;
  url?: string | undefined;
}

// Returns the image bytes, plus the public URL when there is one (fal and
// Fourthwall can fetch it; data URLs have none).
export const loadArtwork = async ({
  fileUrl,
  url,
}: ArtworkSource): Promise<{ bytes: Uint8Array; source?: string }> => {
  const given = [fileUrl, url].filter((value) => value !== undefined);
  if (given.length !== 1) {
    throw new Error("pass exactly one of artwork or url");
  }
  if (url?.startsWith("data:") === true) {
    return { bytes: decodeDataUrl(url) };
  }
  const remote = fileUrl ?? url ?? "";
  return { bytes: await downloadImage(remote), source: remote };
};
