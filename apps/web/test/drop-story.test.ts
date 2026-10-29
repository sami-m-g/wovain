import { describe, expect, it } from "vitest";

import { leadIdeaOf, sectionState } from "@/components/drops/drop-sections";

import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";

describe("the drop page's section states", () => {
  it("marks earlier sections done and the current one waiting", () => {
    const run = { status: "awaiting_approval" as const, step: "design" };

    expect(sectionState("ideas", run)).toBe("done");
    expect(sectionState("designs", run)).toBe("waiting");
    expect(sectionState("products", run)).toBe("not_started");
  });

  it("says working while the run works, stopped when it failed", () => {
    expect(sectionState("ideas", { status: "running", step: "research" })).toBe(
      "working"
    );
    expect(
      sectionState("products", { status: "failed", step: "publish" })
    ).toBe("stopped");
  });

  it("is all done once the drop is complete", () => {
    expect(
      sectionState("campaign", { status: "completed", step: "campaign" })
    ).toBe("done");
  });
});

describe("the lead idea", () => {
  const ideas = [
    { id: "a", score: 0.4 },
    { id: "b", score: 0.9 },
    { id: "c", score: 0.6 },
  ];

  it("is the first picked idea", () => {
    expect(leadIdeaOf(ideas, ["c"])?.id).toBe("c");
  });

  it("is the best scored when none is picked", () => {
    expect(leadIdeaOf(ideas, [])?.id).toBe("b");
  });

  it("is missing before Qloo returns ideas", () => {
    expect(leadIdeaOf([], [])).toBeUndefined();
  });
});

describe("drop page messages", () => {
  it.each([
    ["en", en],
    ["es", es],
    ["fr", fr],
  ])("name every section, state and the Qloo mark in %s", (_, messages) => {
    for (const section of [
      "ideas",
      "designs",
      "products",
      "campaign",
    ] as const) {
      expect(messages.DropStory[section].title).toBeTruthy();
      expect(messages.DropStory[section].notStarted).toBeTruthy();
    }
    expect(messages.DropStory.state.not_started).toBeTruthy();
    expect(messages.Qloo.decided).toBeTruthy();
  });
});
