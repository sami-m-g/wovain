import { describe, expect, it } from "vitest";

import { pickIdea, reviewDesign } from "./autopilot";
import {
  applyFacts,
  draftBrief,
  judgeDesign,
  judgeReplySchema,
  printFacts,
  redrawCanFix,
  REQUIRED_PX,
  sightFacts,
  trademarkFact,
  visionReplySchema,
} from "./design";
import type { DesignBrief, VisionReply } from "./design";
import { artInput } from "./fal";
import { fakeAgents, fakeNemotron } from "./test-doubles";
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
    { note: "A cat, not a garment.", pass: true, rule: "garment" },
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

// What the vision model sees in good art: a cat that prints "NOT TODAY" and
// shows on both listed colors.
const clearSight: VisionReply = visionReplySchema.parse({
  background: { note: "Stands alone.", pass: true },
  contrast: [
    { color: "black", note: "Cream lines pop.", visible: true },
    { color: "sand", note: "Dark outline reads.", visible: true },
  ],
  garment: { note: "A cat.", pass: true },
  printedText: { note: "Matches.", pass: true },
  read: ["NOT", "TODAY"],
  subject: "A cat reading under a lamp with the words NOT TODAY.",
});

const sharpArt = {
  height: REQUIRED_PX,
  url: "https://fal.media/b.png",
  width: REQUIRED_PX,
};

const judgeWith = async (
  sight: VisionReply,
  { reply = passingReply, under = brief } = {}
) => {
  const fake = fakeAgents({ design_judge: [reply], design_vision: [sight] });
  const judged = await judgeDesign(fake.ask, {
    artwork: sharpArt,
    brief: under,
    idea: "cozy reading",
  });
  return { ...judged, asked: fake.asked };
};

const failed = (judgment: { checks: { pass: boolean; rule: string }[] }) =>
  judgment.checks.filter((check) => !check.pass).map((check) => check.rule);

// A judgment whose one failed check is the trademark check on one phrase.
const judgedTrademark = (verdict: "blocked" | "unchecked") => {
  const trademark = {
    checks: [{ citations: [], phrase: "NOT TODAY", verdict }],
    pass: false,
  };
  return {
    ...applyFacts(passingReply, [
      ...printFacts(sharpArt),
      trademarkFact(trademark),
    ]),
    trademark,
  };
};

describe("the design judge", () => {
  it("lets code decide print size over the model's word", async () => {
    const { ask } = fakeAgents({
      design_judge: [passingReply],
      design_vision: [clearSight],
    });
    const { judgment: small } = await judgeDesign(ask, {
      artwork: { height: 1024, url: "https://fal.media/a.png", width: 1024 },
      brief,
      idea: "cozy reading",
    });
    expect(small.verdict).toBe("revise");
    expect(
      small.checks.find((check) => check.rule === "print_size")?.pass
    ).toBe(false);

    const sharp = applyFacts(passingReply, printFacts(sharpArt));
    expect(sharp.verdict).toBe("ready");
  });

  it("sends back printed words that match a trademark record", () => {
    const blocked = trademarkFact({
      checks: [
        {
          citations: [
            {
              title: "NOT TODAY Trademark",
              url: "https://www.trademarkia.com/not-today-1",
            },
          ],
          phrase: "NOT TODAY",
          verdict: "blocked",
        },
      ],
      pass: false,
    });
    const judgment = applyFacts(passingReply, [
      ...printFacts(sharpArt),
      blocked,
    ]);
    expect(judgment.verdict).toBe("revise");
    expect(blocked.note).toContain("trademarkia.com");

    const clear = trademarkFact({
      checks: [{ citations: [], phrase: "NOT TODAY", verdict: "clear" }],
      pass: true,
    });
    expect(
      applyFacts(passingReply, [...printFacts(sharpArt), clear]).verdict
    ).toBe("ready");
  });

  it("redraws for a matched mark, not for a phrase it couldn't check", () => {
    const unchecked = judgedTrademark("unchecked");
    // Held for the merchant all the same.
    expect(unchecked.verdict).toBe("revise");
    expect(redrawCanFix(unchecked)).toBe(false);
    expect(redrawCanFix(judgedTrademark("blocked"))).toBe(true);
    // Anything else the judge failed still gets its redraw.
    expect(
      redrawCanFix({
        ...unchecked,
        checks: [
          ...unchecked.checks,
          { note: "Too small.", pass: false, rule: "print_size" },
        ],
      })
    ).toBe(true);
  });

  it("looks at the drawn artwork before it judges the brief", async () => {
    const { asked, judgment } = await judgeWith(clearSight);

    expect(asked).toMatchObject([
      { images: [sharpArt.url], name: "design_vision" },
      { images: [], name: "design_judge" },
    ]);
    expect(judgment.verdict).toBe("ready");
    expect(judgment.seen).toContain("cat");
    expect(failed(judgment)).toEqual([]);
  });

  it("fails art that is a picture of a garment", async () => {
    // The pink tee that reached approval: the image is a T-shirt.
    const { judgment } = await judgeWith(
      {
        ...clearSight,
        garment: {
          note: "The subject is a pink cropped T-shirt silhouette.",
          pass: false,
        },
        read: [],
        subject: "A pink cropped tee silhouette in line art.",
      },
      { under: { ...brief, printedText: [] } }
    );

    expect(judgment.verdict).toBe("revise");
    expect(failed(judgment)).toEqual(["garment"]);
  });

  it("fails a brief whose art prompt draws a garment, whatever the image", async () => {
    const reply = judgeReplySchema.parse({
      ...passingReply,
      checks: passingReply.checks.map((check) =>
        check.rule === "garment"
          ? { note: "The subject is a tee.", pass: false, rule: "garment" }
          : check
      ),
    });
    const { judgment } = await judgeWith(clearSight, { reply });

    expect(failed(judgment)).toEqual(["garment"]);
  });

  it("drops the garment colors dark art disappears on", async () => {
    const { brief: kept, judgment } = await judgeWith({
      ...clearSight,
      contrast: [
        { color: "Black", note: "A black cat vanishes.", visible: false },
        { color: "sand", note: "Reads well.", visible: true },
      ],
    });

    expect(kept.garmentColors).toEqual(["sand"]);
    expect(judgment.verdict).toBe("ready");
    expect(
      judgment.checks.find((check) => check.rule === "contrast")?.note
    ).toContain("dropped black");
  });

  it("fails art that shows on no listed color", async () => {
    const { brief: kept, judgment } = await judgeWith(
      {
        ...clearSight,
        contrast: [
          { color: "black", note: "Vanishes.", visible: false },
          { color: "navy", note: "Vanishes.", visible: false },
        ],
      },
      { under: { ...brief, garmentColors: ["black", "navy"] } }
    );

    expect(failed(judgment)).toEqual(["contrast"]);
    expect(kept.garmentColors).toEqual(["black", "navy"]);
  });

  it("fails printed text the brief doesn't print, even when the model passed it", () => {
    const sight = sightFacts(
      { ...clearSight, read: ["TEE", "TIME"] },
      { ...brief, printedText: [] }
    );
    const check = sight.facts.find((fact) => fact.rule === "printed_text");

    expect(check?.pass).toBe(false);
    expect(check?.note).toContain('Read "TEE TIME"');
  });

  it("never lets the text model overrule what the image shows", async () => {
    const reply = judgeReplySchema.parse({
      ...passingReply,
      checks: [
        ...passingReply.checks,
        { note: "Looks fine.", pass: true, rule: "background" },
      ],
    });
    const { judgment } = await judgeWith(
      {
        ...clearSight,
        background: { note: "A filled pink square.", pass: false },
      },
      { reply }
    );

    expect(failed(judgment)).toEqual(["background"]);
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

describe("draftBrief", () => {
  it("passes Qloo's aesthetic cues to the brief, never the names", async () => {
    const { ask, asked } = fakeAgents({ design_brief: [brief] });
    const tasted: TrendIdea = {
      ...idea("anime", 0.9),
      taste: {
        affinities: [
          {
            affinity: 0.9,
            because: [{ id: "E1", name: "Studio Ghibli", share: 1 }],
            cues: ["Minimalist", "Trendy"],
            id: "B1",
            name: "Zozotown",
            type: "brand",
          },
          {
            affinity: 0.8,
            because: [],
            cues: ["minimalist", "Cinematic"],
            id: "M1",
            name: "Mirai",
            type: "movie",
          },
        ],
        seeds: [{ id: "E1", name: "Studio Ghibli", type: "artist" }],
        status: "used",
        tag: { affinity: 0.9, id: "urn:tag:x", name: "anime" },
      },
    };

    await draftBrief(ask, { avoidNames: [], idea: tasted });

    const prompt = asked[0]?.prompt ?? "";
    expect(JSON.parse(prompt).taste).toEqual({
      cues: ["Minimalist", "Trendy", "Cinematic"],
      domains: ["brand", "movie"],
    });
    expect(prompt).not.toContain("Zozotown");
    expect(prompt).not.toContain("Mirai");
    expect(prompt).not.toContain("Studio Ghibli");
  });

  it("sends no taste when Qloo didn't shape the idea", async () => {
    const { ask, asked } = fakeAgents({ design_brief: [brief] });

    await draftBrief(ask, { avoidNames: [], idea: idea("anime", 0.9) });

    expect(JSON.parse(asked[0]?.prompt ?? "{}").taste).toBeUndefined();
  });
});
