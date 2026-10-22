import { expect, test } from "vitest";

import { jobHandles, mediaUrls } from "../../src/lib/fal-media.ts";

test("job handles come from a submit_jobs reply, structured or as JSON text", () => {
  const job = { endpoint_id: "fal-ai/nano-banana-pro/edit", request_id: "r1" };
  expect(
    jobHandles({ structuredContent: { results: [{ index: 0, ...job }] } })
  ).toEqual([{ endpointId: job.endpoint_id, requestId: "r1" }]);
  expect(
    jobHandles({ content: [{ text: JSON.stringify([job]), type: "text" }] })
  ).toEqual([{ endpointId: job.endpoint_id, requestId: "r1" }]);
  expect(jobHandles({ content: [{ text: "not json", type: "text" }] })).toEqual(
    []
  );
});

test("media URLs are https fal.media only, once each", () => {
  const url = "https://v3b.fal.media/files/a.jpg";
  expect(
    mediaUrls({
      structuredContent: {
        images: [{ url }, { url }],
        other: ["http://v3b.fal.media/x.jpg", "https://evil.example/a.jpg"],
      },
    })
  ).toEqual([url]);
});
