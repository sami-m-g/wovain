import { z } from "zod";

// fal's CDN gives finished videos a public URL that the ad card can play and
// Meta can fetch (rest.fal.ai storage API: initiate, then PUT the bytes).
const INITIATE_URL =
  "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

const initiateSchema = z.object({ file_url: z.url(), upload_url: z.url() });

export const uploadToFal = async (
  falKey: string,
  bytes: Uint8Array,
  fileName: string,
  contentType: string
): Promise<string> => {
  const initiate = await fetch(INITIATE_URL, {
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
    headers: {
      authorization: `Key ${falKey}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });
  if (!initiate.ok) {
    throw new Error(`fal storage answered ${initiate.status}`);
  }
  const { file_url: fileUrl, upload_url: uploadUrl } = initiateSchema.parse(
    await initiate.json()
  );
  const upload = await fetch(uploadUrl, {
    body: new Uint8Array(bytes),
    headers: { "content-type": contentType },
    method: "PUT",
    signal: AbortSignal.timeout(120_000),
  });
  if (!upload.ok) {
    throw new Error(`fal storage upload answered ${upload.status}`);
  }
  return fileUrl;
};
