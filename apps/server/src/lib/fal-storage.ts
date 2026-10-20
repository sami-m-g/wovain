import { createFalClient } from "@fal-ai/client";

// fal's CDN gives finished videos a public URL that the ad card can play and
// Meta can fetch.
export const uploadToFal = async (
  falKey: string,
  bytes: Uint8Array,
  fileName: string,
  contentType: string
): Promise<string> => {
  // The client sets no timeout, so a stalled upload would hang finish_video.
  const fal = createFalClient({
    credentials: falKey,
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) =>
        await fetch(input, { ...init, signal: AbortSignal.timeout(120_000) }),
      { preconnect: fetch.preconnect }
    ),
  });
  const file = new File([new Uint8Array(bytes)], fileName, {
    type: contentType,
  });
  return await fal.storage.upload(file);
};
