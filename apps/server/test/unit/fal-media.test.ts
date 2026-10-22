import { expect, test } from "vitest";

import { gpuSeconds, jobHandles, mediaUrls } from "../../src/lib/fal-media.ts";

test("GPU seconds come from fal's metrics or the model's timings", () => {
  expect(
    gpuSeconds({
      structuredContent: { result: { timings: { inference: 16.4 } } },
    })
  ).toBe(16.4);
  expect(
    gpuSeconds({ structuredContent: { metrics: { inference_time: 3.42 } } })
  ).toBe(3.42);
  expect(gpuSeconds({ structuredContent: { result: { video: {} } } })).toBe(
    undefined
  );
});

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
