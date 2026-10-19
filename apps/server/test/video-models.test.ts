import { expect, test } from "bun:test";

import { defaultSettings } from "@wovain/shared/settings";
import { clipCost, videoModels } from "@wovain/shared/video-models";

test("a 15 s clip costs what fal lists", () => {
  expect(clipCost("kling-v3-standard", 15)).toBeCloseTo(2.1, 2);
  expect(clipCost("h3-max-turbo", 15)).toBeCloseTo(0.24, 2);
  expect(clipCost("h3-max", 15)).toBeCloseTo(0.49, 2);
});

test("the default model is one that keeps the print", () => {
  expect(videoModels[defaultSettings().video.model].keepsPrint).toBe(true);
});
