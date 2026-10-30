import { HttpResponse, http } from "msw";
import sharp from "sharp";

// fal's queue (the official client's submit, status and result calls) for
// every endpoint: each job completes at once with the same print art, a
// square of ink on a transparent background, served from the media host the
// widgets may load (MCP_WIDGET_RESOURCE_DOMAINS).
export const ART_URL = "https://media.example.com/e2e-art.png";
const QUEUE = "https://queue.fal.run";
const ART_PX = 1024;
const INSET_PX = 256;

export const artPng = await sharp({
  create: {
    background: { alpha: 0, b: 0, g: 0, r: 0 },
    channels: 4,
    height: ART_PX,
    width: ART_PX,
  },
})
  .composite([
    {
      input: await sharp({
        create: {
          background: "#2f4f2f",
          channels: 4,
          height: ART_PX - INSET_PX * 2,
          width: ART_PX - INSET_PX * 2,
        },
      })
        .png()
        .toBuffer(),
      left: INSET_PX,
      top: INSET_PX,
    },
  ])
  .png()
  .toBuffer();

const result = {
  image: { url: ART_URL },
  images: [
    { content_type: "image/png", height: null, url: ART_URL, width: null },
  ],
};

export const fal = [
  http.post(`${QUEUE}/*`, ({ request }) => {
    const base = new URL(request.url).pathname.split("/").slice(1, 3).join("/");
    const requests = `${QUEUE}/${base}/requests/e2e`;
    return HttpResponse.json({
      request_id: "e2e",
      response_url: requests,
      status: "IN_QUEUE",
      status_url: `${requests}/status`,
    });
  }),
  http.get(`${QUEUE}/*/requests/:id/status`, () =>
    HttpResponse.json({ status: "COMPLETED" })
  ),
  http.get(`${QUEUE}/*/requests/:id`, () => HttpResponse.json(result)),
  http.get(
    ART_URL,
    () =>
      new HttpResponse(new Uint8Array(artPng), {
        headers: { "Content-Type": "image/png" },
      })
  ),
];
