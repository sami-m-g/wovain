import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  artRequest,
  finishArt,
  gptImageSize,
  inspectPng,
  labelSvg,
  nearestRatio,
  parseArtModels,
  pieceFacts,
  artSourceKey,
  rasterizeSvg,
  snapToPalette,
} from "./art";
import type { ArtModels, DropArt } from "./art";
import type { FalJobs } from "./fal";

const MODELS: ArtModels = {
  cutout: "cutout-model",
  graphic: "graphic-model",
  pattern: "pattern-model",
  typographic: "type-model",
  upscale: "upscale-model",
  vector: "vector-model",
};

const ART: DropArt = {
  graphicPrompt: "A moth over a full moon, linocut",
  graphicText: ["NIGHT SHIFT"],
  labelText: "Wovain",
  markPrompt: "A moth monogram",
  palette: ["#111111", "#f2e8d5", "#c0392b"],
  patternPrompt: "Small moths",
  sleeveText: "EST. 2026",
};

const solid = async (
  width: number,
  height: number,
  alpha = 1
): Promise<Buffer> =>
  await sharp({
    create: {
      background: { alpha, b: 40, g: 40, r: 200 },
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toBuffer();

// A small square in the middle of a transparent canvas.
const centered = async (side: number) =>
  await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: side,
      width: side,
    },
  })
    .composite([{ input: await solid(side / 4, side / 4) }])
    .png()
    .toBuffer();

describe("parseArtModels", () => {
  it("names the variable when it is missing", () => {
    expect(() => parseArtModels("")).toThrow(/FAL_ART_MODELS is not set/u);
  });

  it("refuses unknown keys", () => {
    expect(() =>
      parseArtModels(
        JSON.stringify({
          cutout: "a",
          extra: "b",
          pattern: "c",
          typographic: "d",
          upscale: "e",
          vector: "f",
        })
      )
    ).toThrow(/FAL_ART_MODELS is invalid/u);
  });
});

describe("gptImageSize", () => {
  it("keeps a portrait back print portrait inside GPT Image's limits", () => {
    const size = gptImageSize({ height: 2400, width: 1800 });
    expect(size.height).toBeGreaterThan(size.width);
    expect(size.width % 16).toBe(0);
    expect(size.height).toBeLessThanOrEqual(3840);
    expect(size.width * size.height).toBeLessThanOrEqual(8_294_400);
  });

  it("caps the ratio at 3:1", () => {
    const size = gptImageSize({ height: 100, width: 1000 });
    expect(size.width / size.height).toBeLessThanOrEqual(3.01);
  });
});

describe("artRequest", () => {
  const pixels = { height: 2400, width: 1800 };

  it("draws the graphic with GPT Image on a transparent background", () => {
    const request = artRequest("graphic", ART, MODELS, pixels);
    expect(request?.model).toBe("graphic-model");
    expect(request?.input).toMatchObject({ background: "transparent" });
    expect(String(request?.input.prompt)).toContain('"NIGHT SHIFT"');
  });

  it("draws embroidery as a vector in at most 6 palette colors", () => {
    const request = artRequest("embroidery", ART, MODELS, pixels);
    expect(request).toMatchObject({ model: "vector-model", output: "svg" });
    expect(String(request?.input.prompt)).toContain("thick strokes");
    expect(request?.input.image_size).toEqual({ height: 1024, width: 768 });
    expect(request?.input.colors).toEqual([
      { b: 17, g: 17, r: 17 },
      { b: 213, g: 232, r: 242 },
      { b: 43, g: 57, r: 192 },
    ]);
  });

  it("draws embroidery wide for a hat and keys it per ratio", () => {
    const hat = { height: 300, width: 600 };
    const request = artRequest("embroidery", ART, MODELS, hat);
    expect(request?.input.image_size).toEqual({ height: 512, width: 1024 });
    expect(artSourceKey("embroidery", hat)).toBe("embroidery:2x1");
    expect(artSourceKey("embroidery", { height: 600, width: 600 })).toBe(
      "embroidery:1x1"
    );
    expect(artSourceKey("mark", hat)).toBe("mark");
  });

  it("sets sleeve type at the sleeve's ratio", () => {
    const request = artRequest("typographic", ART, MODELS, {
      height: 1800,
      width: 450,
    });
    expect(request?.input.aspect_ratio).toBe("1:4");
  });

  it("tiles patterns and leaves labels to code", () => {
    expect(artRequest("pattern", ART, MODELS, pixels)?.input).toMatchObject({
      tiling_mode: "both",
    });
    expect(artRequest("label", ART, MODELS, pixels)).toBeUndefined();
  });
});

describe("nearestRatio", () => {
  it("rounds to a supported ratio", () => {
    expect(nearestRatio({ height: 1000, width: 1800 })).toBe("16:9");
  });
});

describe("rasterizing and inspecting", () => {
  it("rasterizes the label at the region's pixels with hard alpha", async () => {
    const png = await rasterizeSvg(labelSvg("Wovain", ART.palette), {
      height: 450,
      width: 450,
    });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([450, 450]);
    const { data } = await sharp(png)
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(new Set(data)).toEqual(new Set([0, 255]));
  });

  it("sees a square image as a slab", async () => {
    const seen = await inspectPng(await solid(200, 200));
    expect(seen.fill).toBe(1);
  });

  it("sees art on a transparent canvas", async () => {
    const seen = await inspectPng(await centered(400));
    expect(seen.transparentShare).toBeGreaterThan(0.9);
    expect(seen.colors).toBe(1);
  });
});

describe("pieceFacts", () => {
  const back = {
    artType: "graphic" as const,
    method: "dtg" as const,
    pixels: { height: 2400, width: 1800 },
    printInches: { h: 16, w: 12 },
  };
  const clean = {
    colors: 3,
    fill: 0.5,
    hasAlpha: true,
    height: 2400,
    opaqueShare: 0.3,
    transparentShare: 0.4,
    width: 1800,
  };

  it("passes sharp, transparent, shaped art", () => {
    const facts = pieceFacts(
      back,
      { height: 3328, vector: false, width: 2496 },
      clean
    );
    expect(facts.every((fact) => fact.pass)).toBe(true);
  });

  it("fails low resolution, a wrong aspect and a slab", () => {
    const facts = pieceFacts(
      back,
      { height: 1024, vector: false, width: 1024 },
      { ...clean, fill: 0.98, transparentShare: 0 }
    );
    expect(facts.filter((fact) => !fact.pass).map((fact) => fact.rule)).toEqual(
      ["print_dpi", "transparency", "slab"]
    );
  });

  it("fails art with nothing to print", () => {
    const facts = pieceFacts(
      back,
      { height: 3328, vector: false, width: 2496 },
      { ...clean, colors: 0, fill: 0, opaqueShare: 0, transparentShare: 1 }
    );
    expect(facts.filter((fact) => !fact.pass).map((fact) => fact.rule)).toEqual(
      ["has_art"]
    );
  });

  it("counts thread colors on embroidery", () => {
    const facts = pieceFacts(
      { ...back, artType: "embroidery", method: "embroidery" },
      { height: 2400, vector: true, width: 1800 },
      { ...clean, colors: 9 }
    );
    expect(facts.find((fact) => fact.rule === "thread_colors")?.pass).toBe(
      false
    );
  });
});

// fal jobs that answer each model with its URL.
const fakeJobs = (outputs: Record<string, string>) => {
  const submit = vi.fn(async (model: string) => await Promise.resolve(model));
  const result = vi.fn(
    async (model: string) =>
      await Promise.resolve({ image: { url: outputs[model] } })
  );
  return { jobs: { result, submit } as unknown as FalJobs, submit };
};

// A fetch that serves these files.
const serve =
  (files: Record<string, Buffer>): typeof fetch =>
  async (input) => {
    const body = files[String(input)];
    return await Promise.resolve(
      body === undefined
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array(body))
    );
  };

describe("finishArt", () => {
  const piece = {
    artType: "graphic" as const,
    method: "dtg" as const,
    pixels: { height: 800, width: 600 },
    printInches: { h: 16, w: 12 },
  };

  it("cuts out and upscales raster art that needs it, once each", async () => {
    const opaque = await sharp(await solid(300, 400))
      .removeAlpha()
      .png()
      .toBuffer();
    const { jobs, submit } = fakeJobs({
      "cutout-model": "https://fal.test/cut.png",
      "upscale-model": "https://fal.test/big.png",
    });
    const done = await finishArt({
      art: ART,
      fetchFn: serve({
        "https://fal.test/big.png": await centered(1200),
        "https://fal.test/cut.png": await centered(400),
        "https://fal.test/raw.png": opaque,
      }),
      jobs,
      models: MODELS,
      piece,
      sourceUrl: "https://fal.test/raw.png",
    });
    expect(submit.mock.calls.map(([model]) => model)).toEqual([
      "cutout-model",
      "upscale-model",
    ]);
    expect(done.sourceUrl).toBe("https://fal.test/big.png");
    expect([done.width, done.height]).toEqual([600, 800]);
  });

  it("draws the label with no fal call", async () => {
    const { jobs, submit } = fakeJobs({});
    const done = await finishArt({
      art: ART,
      jobs,
      models: MODELS,
      piece: { ...piece, artType: "label" },
    });
    expect(submit).not.toHaveBeenCalled();
    expect(done.facts.find((fact) => fact.rule === "print_dpi")?.pass).toBe(
      true
    );
    expect(done.facts.find((fact) => fact.rule === "has_art")?.pass).toBe(true);
  });
});

describe("embroidery colors", () => {
  // Three concentric circles: rasterizing blends colors along every curve.
  const rings =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="48" fill="rgb(16,16,16)"/><circle cx="50" cy="50" r="32" fill="#f2e8d5"/><circle cx="50" cy="50" r="16" fill="crimson"/></svg>';

  it("blends edges when rasterized, so the SVG's colors aren't enough", async () => {
    const png = await rasterizeSvg(rings, { height: 600, width: 600 });
    const seen = await inspectPng(png);
    expect(seen.colors).toBeGreaterThan(6);
  });

  it("leaves at most the palette's colors in the PNG", async () => {
    const png = await snapToPalette(
      await rasterizeSvg(rings, { height: 600, width: 600 }),
      ART.palette
    );
    const seen = await inspectPng(png);
    expect(seen.colors).toBeLessThanOrEqual(ART.palette.length);
    expect(seen.colors).toBeGreaterThan(1);
  });

  it("finishes embroidery with at most 6 thread colors", async () => {
    const { jobs } = fakeJobs({});
    const done = await finishArt({
      art: ART,
      fetchFn: serve({ "https://fal.test/rings.svg": Buffer.from(rings) }),
      jobs,
      models: MODELS,
      piece: {
        artType: "embroidery",
        method: "embroidery",
        pixels: { height: 300, width: 600 },
        printInches: { h: 2, w: 4 },
      },
      sourceUrl: "https://fal.test/rings.svg",
    });
    expect(
      done.facts.find((fact) => fact.rule === "thread_colors")
    ).toMatchObject({ pass: true });
  });
});
