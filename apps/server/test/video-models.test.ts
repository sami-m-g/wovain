import { expect, test } from "bun:test";

import { defaultSettings } from "@wovain-foss/shared/settings";
import {
  clipCost,
  clipSeconds,
  videoModels,
} from "@wovain-foss/shared/video-models";

test("a 15 s clip costs what fal lists", () => {
  expect(clipCost("kling-v3-standard", 15)).toBeCloseTo(2.1, 2);
  expect(clipCost("h3-max-turbo", 15)).toBeCloseTo(0.24, 2);
  expect(clipCost("h3-max", 15)).toBeCloseTo(0.49, 2);
  expect(clipCost("h3-max-reference", 15)).toBeCloseTo(0.75, 2);
});

test("a clip is capped at the model's maximum length", () => {
  expect(clipSeconds("kling-o1-reference", 15)).toBe(10);
  expect(clipCost("kling-o1-reference", 15)).toBeCloseTo(0.84, 2);
});

test("the cheaper production models keep the print", () => {
  expect(videoModels["h3-max-reference"].keepsPrint).toBe(true);
  expect(videoModels["kling-o1-reference"].keepsPrint).toBe(true);
});

test("the default model is one that keeps the print", () => {
  expect(videoModels[defaultSettings().video.model].keepsPrint).toBe(true);
});
