import { defaultSettings } from "@wovain/shared/settings";
import {
  clipCost,
  clipSeconds,
  videoModels,
} from "@wovain/shared/video-models";
import { expect, test } from "vitest";

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

test("the default is one short clip from the fast model", () => {
  const { video } = defaultSettings();
  expect(video).toMatchObject({
    clipsPerProduct: 1,
    model: "h3-max-turbo",
    seconds: 5,
  });
  expect(clipCost(video.model, video.seconds)).toBeCloseTo(0.08, 2);
});
