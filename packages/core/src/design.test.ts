import { describe, expect, it } from "vitest";

import { pickIdea, reviewDesign } from "./autopilot";
import {
  applyFacts,
  judgeDesign,
  judgeReplySchema,
  printFacts,
  REQUIRED_PX,
} from "./design";
import type { DesignBrief } from "./design";
import { artInput } from "./fal";
import { fakeNemotron } from "./test-doubles";
import type { TrendIdea } from "./trends";

const brief: DesignBrief = {
  artPrompt: "A cat reading under a lamp, risograph style",
  description: "For quiet nights in. Soft lines, loud comfort.",
  garmentColors: ["black", "sand"],
  printedText: ["NOT TODAY"],
  title: "Reading Cat Tee Risograph Lamp",
};

const passingReply = judgeReplySchema.parse({
  checks: [
    { note: "Keyword first.", pass: true, rule: "title" },
    { note: "Two lines.", pass: true, rule: "description" },
    { note: "On idea.", pass: true, rule: "idea_fit" },
    { note: "Original.", pass: true, rule: "originality" },
    // The model can't overrule code on print size.
    { note: "Looks big enough.", pass: true, rule: "print_size" },
  ],
  coach: "A cozy winner.",
  fixes: [],
  score: 88,
});

const idea = (theme: string, score: number): TrendIdea => ({
  rank: 1,
  references: [],
  score,
  signals: {
    ipSafety: 1,
    margin: 0.5,
    marketHits: 2,
    newsHits: 3,
    recency: 0.5,
    relevance: 0.5,
  },
  sources: [{ title: theme, url: "https://news.example/a" }],
  theme,
});

describe("the design judge", () => {
  it("lets code decide print size over the model's word", async () => {
    const { ask } = fakeNemotron(passingReply);
    const small = await judgeDesign(ask, {
      artwork: { height: 1024, url: "https://fal.media/a.png", width: 1024 },
      brief,
      idea: "cozy reading",
    });
    expect(small.verdict).toBe("revise");
    expect(
      small.checks.find((check) => check.rule === "print_size")?.pass
    ).toBe(false);

    const sharp = applyFacts(
      passingReply,
      printFacts({
        height: REQUIRED_PX,
        url: "https://fal.media/b.png",
        width: REQUIRED_PX,
      })
    );
    expect(sharp.verdict).toBe("ready");
  });

  it("asks fal for transparent art that prints only the brief's words", () => {
    const input = artInput(brief);
    expect(input.background).toBe("transparent");
    expect(input.image_size.width).toBe(REQUIRED_PX);
    expect(input.prompt).toContain('"NOT TODAY"');
    expect(artInput({ ...brief, printedText: [] }).prompt).toContain("No text");
  });
});

describe("autopilot", () => {
  it("never approves a design the judge wants revised", async () => {
    const { ask, asked } = fakeNemotron({ approve: true, reason: "Love it" });
    const judgment = applyFacts(
      passingReply,
      printFacts({ height: 1, url: "https://fal.media/c.png", width: 1 })
    );

    const decision = await reviewDesign(ask, { brief, idea: "cozy", judgment });

    expect(decision.approve).toBe(false);
    expect(asked).toEqual([]);
  });

  it("asks Nemotron when the judge says ready", async () => {
    const { ask, asked } = fakeNemotron({ approve: true, reason: "On trend" });
    const judgment = applyFacts(
      passingReply,
      printFacts({
        height: REQUIRED_PX,
        url: "https://fal.media/d.png",
        width: REQUIRED_PX,
      })
    );

    const decision = await reviewDesign(ask, { brief, idea: "cozy", judgment });

    expect(decision).toEqual({ approve: true, reason: "On trend" });
    expect(asked).toEqual(["autopilot_review_design"]);
  });

  it("falls back to the top idea when the pick is out of range", async () => {
    const { ask } = fakeNemotron({ index: 7, reason: "?" });
    const ideas = [idea("first", 0.9), idea("second", 0.5)];

    const { idea: chosen } = await pickIdea(ask, ideas);

    expect(chosen.theme).toBe("first");
  });
});
