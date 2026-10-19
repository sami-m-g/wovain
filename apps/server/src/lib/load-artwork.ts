import { readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { downloadImage } from "./fetch-image.ts";

const MAX_BYTES = 50 * 1024 * 1024;
const DATA_URL =
  /^data:image\/(?:png|jpeg|webp);base64,(?<base64>[A-Za-z0-9+/=\s]+)$/u;

// The desktop app's image generation returns a data: URL, not a file object.
const decodeDataUrl = (url: string) => {
  const base64 = DATA_URL.exec(url)?.groups?.["base64"];
  if (base64 === undefined) {
    throw new Error("only PNG, JPEG or WebP data URLs are accepted");
  }
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("Image is larger than 50 MB");
  }
  return bytes;
};

// Attachments in desktop chats land in the system temp folder; nothing outside
// it is read, so a prompt can't point the server at other files on the Mac.
const readAttachment = async (localPath: string) => {
  // macOS keeps per-user temp files under /private/var/folders even when the
  // app starts the server without the shell's TMPDIR.
  const [tempRoot, resolved] = await Promise.all([
    realpath(tmpdir()),
    realpath(path.resolve(localPath)),
  ]);
  const roots = [tempRoot, "/private/var/folders"];
  if (!roots.some((root) => resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error("only images attached in this chat can be read");
  }
  const info = await stat(resolved);
  if (!info.isFile() || info.size > MAX_BYTES) {
    throw new Error("the attachment isn't an image file under 50 MB");
  }
  return new Uint8Array(await readFile(resolved));
};

export interface ArtworkSource {
  fileUrl?: string | undefined;
  localPath?: string | undefined;
  url?: string | undefined;
}

// Returns the image bytes, plus the public URL when there is one (fal and
// Fourthwall can fetch it; data URLs and attachments have none).
export const loadArtwork = async ({
  fileUrl,
  localPath,
  url,
}: ArtworkSource): Promise<{ bytes: Uint8Array; source?: string }> => {
  const given = [fileUrl, localPath, url].filter(
    (value) => value !== undefined
  );
  if (given.length !== 1) {
    throw new Error("pass exactly one of artwork, path or url");
  }
  if (url?.startsWith("data:") === true) {
    return { bytes: decodeDataUrl(url) };
  }
  if (localPath !== undefined) {
    return { bytes: await readAttachment(localPath) };
  }
  const remote = fileUrl ?? url ?? "";
  return { bytes: await downloadImage(remote), source: remote };
};
