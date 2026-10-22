import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

import { readImageInfo } from "../../src/lib/image.ts";
import type { ImageInfo } from "../../src/lib/image.ts";

const fixture = async (name: string) =>
  new Uint8Array(
    await readFile(path.join(import.meta.dirname, "..", "fixtures", name))
  );

test.each<[string, ImageInfo]>([
  [
    "rgba-64x32.png",
    { format: "png", height: 32, transparent: true, width: 64 },
  ],
  [
    "rgb-48x24.png",
    { format: "png", height: 24, transparent: false, width: 48 },
  ],
  [
    "photo-40x30.jpg",
    { format: "jpeg", height: 30, transparent: false, width: 40 },
  ],
  [
    "alpha-64x32.webp",
    { format: "webp", height: 32, transparent: true, width: 64 },
  ],
  [
    "lossy-48x24.webp",
    { format: "webp", height: 24, transparent: false, width: 48 },
  ],
  [
    "alpha-lossy-64x32.webp",
    { format: "webp", height: 32, transparent: true, width: 64 },
  ],
])("reads %s", async (name, expected) => {
  expect(await readImageInfo(await fixture(name))).toEqual(expected);
});

test.each([
  ["HTML", "<html>nope</html>"],
  [
    "an SVG, whose loader is blocked",
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
  ],
])("returns undefined for %s", async (_, body) => {
  expect(await readImageInfo(new TextEncoder().encode(body))).toBeUndefined();
});
