import { describe, expect, it } from "vitest";

import {
  AI_LABEL,
  castConcept,
  castInput,
  castOf,
  filmInput,
  parseAdVideoModels,
  reviewPassed,
  srtOf,
  timeline,
} from "./ad-video";
import type { AdConcept, AdReview } from "./ad-video";

const CONCEPT: AdConcept = {
  angle: "Night-shift pride",
  cast: {
    age: "30 to 34",
    gender: "man",
    look: "short curls, denim jacket open",
    setting: "a neon-lit diner at night",
  },
  cta: "Shop the drop",
  hook: "Built for the 3 a.m. crew",
  shots: [
    { action: "He turns to camera, push-in", seconds: 2, text: "" },
    {
      action: "Handheld walk past the counter",
      seconds: 9,
      text: "Wear it loud",
    },
    { action: "Close-up on the print", seconds: 4, text: "" },
    { action: "He grins, slow orbit", seconds: 4, text: "Night shift" },
  ],
  sound: {
    ambient: "diner chatter, a coffee cup set down",
    line: "Night shift, all good.",
    music: "warm lo-fi beat",
  },
};

describe("director-made video ads", () => {
  it("is off without models and refuses an invalid value", () => {
    expect(parseAdVideoModels()).toBeUndefined();
    expect(parseAdVideoModels("  ")).toBeUndefined();
    expect(() => parseAdVideoModels('{"cast":"x"}')).toThrow(
      /FAL_AD_VIDEO_MODELS is invalid/u
    );
  });

  it("puts the shots on a 15 to 20 second timeline with a 3 second hook", () => {
    const { seconds, shots } = timeline(CONCEPT);
    expect(seconds).toBeGreaterThanOrEqual(15);
    expect(seconds).toBeLessThanOrEqual(20);
    expect(shots[0]).toMatchObject({ end: 3, start: 0, text: CONCEPT.hook });
    for (const shot of shots.slice(1)) {
      expect(shot.end - shot.start).toBeGreaterThanOrEqual(3);
    }
    expect(shots.at(-1)?.end).toBe(seconds);
  });

  it("stretches a short concept to 15 seconds and trims a long one to 20", () => {
    const short = {
      ...CONCEPT,
      shots: CONCEPT.shots.slice(0, 3).map((shot) => ({ ...shot, seconds: 1 })),
    };
    expect(timeline(short).seconds).toBe(15);
    const long = {
      ...CONCEPT,
      shots: CONCEPT.shots.map((shot) => ({ ...shot, seconds: 10 })),
    };
    expect(timeline(long).seconds).toBe(20);
  });

  it("casts the Qloo buyers' gender and age, the Director's look otherwise", () => {
    expect(
      castOf({ age: "24_and_younger", audiences: [], gender: "female" })
    ).toEqual({ age: "21 to 24", gender: "woman" });
    expect(castOf({ audiences: [], gender: "mixed" })).toEqual({});
    const { cast } = castConcept(CONCEPT, {
      age: "45_to_54",
      audiences: [],
      gender: "female",
    });
    expect(cast).toMatchObject({ age: "45 to 54", gender: "woman" });
    expect(cast.look).toBe(CONCEPT.cast.look);
  });

  it("asks fal for the cast from the mockup and the art", () => {
    const input = castInput(
      {
        artworkUrl: "https://a.test/art.png",
        mockupUrl: "https://a.test/m.png",
      },
      CONCEPT
    );
    expect(input.image_urls).toEqual([
      "https://a.test/m.png",
      "https://a.test/art.png",
    ]);
    expect(input.aspect_ratio).toBe("9:16");
    expect(input.prompt).toContain("a man aged 30 to 34");
  });

  it("films one take with native audio and the shot list", () => {
    const input = filmInput("https://a.test/cast.png", CONCEPT);
    expect(input).toMatchObject({
      aspect_ratio: "9:16",
      audio: true,
      duration: timeline(CONCEPT).seconds,
      start_image_url: "https://a.test/cast.png",
    });
    expect(input.prompt).toContain("Shot 1 (0-3s)");
    expect(input.prompt).toContain('"Night shift, all good". No other speech.');
  });

  it("captions the hook first and ends on the call to action and the AI label", () => {
    const srt = srtOf(CONCEPT);
    const cues = srt.trim().split("\n\n");
    expect(cues[0]).toContain("00:00:00,000 --> 00:00:03,000");
    expect(cues[0]).toContain(CONCEPT.hook);
    expect(cues.at(-1)).toContain(`${CONCEPT.cta}\n${AI_LABEL}`);
    const { seconds } = timeline(CONCEPT);
    expect(cues.at(-1)).toContain(`00:00:${String(seconds)},000`);
  });

  it("passes a review only when every check passes", () => {
    const ok = { note: "", pass: true };
    const review: AdReview = {
      checks: { design: ok, hook: ok, policy: ok, product: ok, text: ok },
      fixes: [],
    };
    expect(reviewPassed(review)).toBe(true);
    expect(
      reviewPassed({
        ...review,
        checks: { ...review.checks, design: { note: "warped", pass: false } },
      })
    ).toBe(false);
  });
});
