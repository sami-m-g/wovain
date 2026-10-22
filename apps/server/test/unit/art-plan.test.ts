import { describe, expect, test } from "vitest";

import { artPieceSchema, artRequest } from "../../src/lib/art-plan.ts";

describe("artRequest", () => {
  test("a hero is a transparent square PNG at print size", () => {
    const request = artRequest(
      artPieceSchema.parse({
        name: "hero front",
        prompt: "A calico cat watching a red sun set behind Mount Fuji",
      })
    );
    expect(request.endpoint_id).toBe(
      "openai/gpt-image-2.5/flare/text-to-image"
    );
    expect(request.input).toMatchObject({
      background: "transparent",
      image_size: { height: 2880, width: 2880 },
      output_format: "png",
    });
    expect(request.input).not.toHaveProperty("image_urls");
  });

  test("a mark that references the hero uses the edit route", () => {
    const request = artRequest(
      artPieceSchema.parse({
        name: "sleeve wordmark",
        prompt: "The words Cat Club in the hero's brush lettering",
        referenceUrls: ["https://v3b.fal.media/files/b/x/hero.png"],
        shape: "wide",
      })
    );
    expect(request.endpoint_id).toBe("openai/gpt-image-2.5/flare/edit");
    expect(request.input).toMatchObject({
      image_size: { height: 1920, width: 3840 },
      image_urls: ["https://v3b.fal.media/files/b/x/hero.png"],
    });
  });

  test("references must be https", () => {
    expect(
      artPieceSchema.safeParse({
        name: "mark",
        prompt: "A simple cat head mark",
        referenceUrls: ["http://example.com/a.png"],
      }).success
    ).toBe(false);
  });
});
