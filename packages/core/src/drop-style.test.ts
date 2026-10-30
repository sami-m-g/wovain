import { expect, it } from "vitest";
import type { z } from "zod";

import { writeAdCopy } from "./ads";
import { draftBrief } from "./design";
import { refitStyle, suggestDropStyle, writerStyle } from "./drop-style";
import {
  contrastRatio,
  knownGarments,
  MIN_INK_CONTRAST,
} from "./garment-colors";
import type { Ask, Nemotron } from "./nemotron";
import { DecisionTrace } from "./trace";
import type { TrendIdea } from "./trends";

const tee = {
  colors: knownGarments(["Black", "White", "Natural", "Sage"]),
  name: "Bella+Canvas 3001",
};

const ideaFor = (theme: string, cues: string[]): TrendIdea =>
  ({
    rank: 1,
    references: [],
    score: 0.8,
    signals: { marketHits: 3, newsHits: 4 },
    sources: [],
    taste: {
      affinities: [
        {
          affinity: 0.9,
          because: [],
          cues,
          id: `Q-${theme}`,
          name: theme,
          type: "movie",
        },
      ],
      failedDomains: [],
    },
    theme,
  }) as unknown as TrendIdea;

// A style writer that follows the drop's cues, as the real one is told to.
const styleWriter: Nemotron = async <T extends z.ZodType>({
  prompt,
  schema,
}: Ask<T>) => {
  const { cues } = JSON.parse(prompt) as { cues: string[] };
  const [first = "plain"] = cues;
  const dark = first.includes("gothic");
  return await Promise.resolve(
    schema.parse({
      palettes: [
        {
          garments: dark ? ["Black"] : ["Natural"],
          inks: dark ? ["#E8E2D0", "#B0245F"] : ["#2F4A2A", "#8C5A2B"],
          label: dark ? "candlelit bone" : "forest floor",
        },
        // Pale ink on White: fails contrast and is moved.
        { garments: ["White"], inks: ["#F3E3A1", "#1A1A1A"], label: "butter" },
      ],
      tones: [
        { label: `${first} and wry`, line: `Made for ${first} evenings.` },
        { label: "warm", line: "Soft as a Sunday." },
      ],
    })
  );
};

const brand = {
  palette: ["#1A1A1A"],
  voice: "warm and a bit cheeky, never crude",
};

it("gives drops with different Qloo audiences different tones and palettes", async () => {
  const gothic = await suggestDropStyle(
    { ask: styleWriter },
    {
      blank: tee,
      brand,
      idea: ideaFor("vampire romance", ["gothic", "moody"]),
      locale: "en",
    }
  );
  const cottage = await suggestDropStyle(
    { ask: styleWriter },
    {
      blank: tee,
      brand,
      idea: ideaFor("plant care", ["pastoral", "cosy"]),
      locale: "en",
    }
  );
  expect(gothic.tone?.label).not.toBe(cottage.tone?.label);
  expect(gothic.palette?.inks).not.toStrictEqual(cottage.palette?.inks);
  expect(gothic.palette?.garments.map((garment) => garment.name)).toStrictEqual(
    ["Black"]
  );
  expect(
    cottage.palette?.garments.map((garment) => garment.name)
  ).toStrictEqual(["Natural"]);
});

it("holds every palette to the blank's colours and contrast", async () => {
  const style = await suggestDropStyle(
    { ask: styleWriter },
    {
      blank: tee,
      brand,
      idea: ideaFor("plant care", ["pastoral"]),
      locale: "en",
    }
  );
  for (const palette of style.palettes) {
    for (const garment of palette.garments) {
      for (const ink of palette.inks) {
        expect(contrastRatio(ink, garment.hex)).toBeGreaterThanOrEqual(
          MIN_INK_CONTRAST
        );
      }
    }
  }
  const butter = style.palettes.find((palette) => palette.label === "butter");
  expect(butter?.adjusted.map((one) => one.from)).toContain("#F3E3A1");
});

it("re-checks the palette when the blank changes", async () => {
  const style = await suggestDropStyle(
    { ask: styleWriter },
    {
      blank: tee,
      brand,
      idea: ideaFor("vampire romance", ["gothic"]),
      locale: "en",
    }
  );
  // A blank that comes only in White: the Black palette can't stay.
  const refit = refitStyle(style, {
    colors: knownGarments(["White"]),
    name: "White tee",
  });
  expect(refit.blank).toBe("White tee");
  expect(
    refit.palettes.every((palette) =>
      palette.garments.every((garment) => garment.name === "White")
    )
  ).toBe(true);
});

it("records the style in the decision trace", async () => {
  const trace = new DecisionTrace({ userId: "user-1" });
  await suggestDropStyle(
    { ask: styleWriter, trace },
    {
      blank: tee,
      brand,
      idea: ideaFor("plant care", ["pastoral"]),
      locale: "en",
    }
  );
  expect(trace.entries.map((entry) => entry.step)).toContain("drop.style");
});

// Records what each writer was told.
const recorder = (reply: unknown) => {
  const calls: { prompt: string; system: string }[] = [];
  const ask: Nemotron = async <T extends z.ZodType>({
    prompt,
    schema,
    system,
  }: Ask<T>) => {
    calls.push({ prompt, system });
    return await Promise.resolve(schema.parse(reply));
  };
  return { ask, calls };
};

it("keeps the brand voice as guardrails in the brief and the ad copy", async () => {
  const style = await suggestDropStyle(
    { ask: styleWriter },
    {
      blank: tee,
      brand,
      idea: ideaFor("plant care", ["pastoral"]),
      locale: "en",
    }
  );
  const forWriters = writerStyle(style);
  expect(forWriters?.guardrails).toBe(brand.voice);

  const brief = recorder({
    artPrompt: "A fern frond drawn in fine ink lines, centered.",
    description: "For slow mornings.",
    garmentColors: ["natural"],
    printedText: [],
    title: "Fern line art tee",
  });
  await draftBrief(brief.ask, {
    avoidNames: [],
    idea: ideaFor("plant care", ["pastoral"]),
    style: forWriters,
  });
  const briefInput = JSON.parse(brief.calls[0]?.prompt ?? "{}") as {
    style?: { guardrails?: string; inks?: string[]; tone?: string };
  };
  expect(briefInput.style?.guardrails).toContain("never crude");
  expect(briefInput.style?.inks).toStrictEqual(style.palette?.inks);
  expect(briefInput.style?.tone).toContain(style.tone?.label ?? "");

  const ads = recorder({
    variants: [
      {
        angle: "mood",
        headline: "Soft as a Sunday",
        message: "A fern for slow mornings.",
      },
      {
        angle: "identity",
        headline: "Green thumbs",
        message: "Line art for plant people.",
      },
    ],
  });
  await writeAdCopy(
    ads.ask,
    { description: "For slow mornings.", idea: "fern", title: "Fern tee" },
    undefined,
    undefined,
    undefined,
    forWriters
  );
  expect(ads.calls[0]?.system).toContain("guardrails");
  expect(ads.calls[0]?.prompt).toContain("never crude");
});
