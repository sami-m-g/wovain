import { expect, it, vi } from "vitest";

import { createArtist, falKeyCall } from "./fal";

// fal on wovain's key answers the artist the same as the merchant's relay:
// queue the drawing, wait for it, read its image.
it("draws through fal's queue on wovain's key", async () => {
  const queue = {
    result: vi.fn(
      async () =>
        await Promise.resolve({
          data: {
            images: [
              { height: null, url: "https://fal.media/a.png", width: null },
            ],
          },
          requestId: "R1",
        })
    ),
    status: vi.fn(async () => await Promise.resolve({ status: "COMPLETED" })),
    submit: vi.fn(async () => await Promise.resolve({ request_id: "R1" })),
  };
  const call = falKeyCall("key", { queue } as never);
  const artist = createArtist(call, {
    model: "fal-ai/gpt-image-1",
    wait: vi.fn(),
  });

  const requestId = await artist.submit({
    artPrompt: "a moth",
    printedText: [],
  } as never);
  const image = await artist.result(requestId);

  expect(requestId).toBe("R1");
  expect(queue.submit).toHaveBeenCalledWith(
    "fal-ai/gpt-image-1",
    expect.objectContaining({
      // The merchant's design stays out of fal's request history.
      headers: { "X-Fal-Store-IO": "0" },
      input: expect.objectContaining({ background: "transparent" }),
    })
  );
  expect(queue.status).toHaveBeenCalledWith("fal-ai/gpt-image-1", {
    requestId: "R1",
  });
  expect(image.url).toBe("https://fal.media/a.png");
});

it("refuses a tool fal's queue doesn't have", async () => {
  const call = falKeyCall("key", { queue: {} } as never);

  await expect(call("cancel_job", {})).rejects.toThrow(/no tool cancel_job/u);
});

it("keeps fal's default storage when the caller doesn't turn it off", async () => {
  const submit = vi.fn(async () => await Promise.resolve({ request_id: "R2" }));
  const call = falKeyCall("key", { queue: { submit } } as never);

  await call("submit_job", { endpoint_id: "fal-ai/x", input: { a: 1 } });

  expect(submit).toHaveBeenCalledWith("fal-ai/x", { input: { a: 1 } });
});
